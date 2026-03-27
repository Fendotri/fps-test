import { computeShot, recoverRecoil, resolveCombatProfile, seedFromWeapon } from './CombatTuning';
import { getWeaponEntry } from '@src/gameplay/loadout/weaponCatalog';

export type SprayScopeState = 'unscoped' | 'scoped';
export type SprayDistanceMeters = 10 | 20;

export type SprayPoint2D = {
    shotIndex: number;
    x: number;
    y: number;
};

export type SprayCaptureQuality = {
    valid: boolean;
    hitRatio: number;
    reason: string;
};

export type SprayReferenceMap = Record<string, {
    unscoped?: Record<string, Array<{ x: number; y: number }>>;
    scoped?: Record<string, Array<{ x: number; y: number }>>;
}>;

export type SprayReferenceSourceType = 'external' | 'bootstrap' | 'unknown';

export type SprayReferencePayload = {
    version?: number;
    reference?: string;
    referenceSourceType?: SprayReferenceSourceType | string;
    referenceVersion?: string;
    updatedAt?: string;
    notes?: string;
    patterns?: SprayReferenceMap;
};

export type SprayMetricSummary = {
    weaponId: string;
    classification: string;
    state: SprayScopeState;
    distance: SprayDistanceMeters;
    sampleCount: number;
    rmseFirst10: number;
    rmseAll: number;
    rmseFirst30: number;
    maxError: number;
    pass: boolean;
    thresholds: {
        rmseFirst10?: number;
        rmseAll: number;
        rmseFirst30?: number;
        max: number;
    };
};

export type SprayReferenceLookup = {
    found: boolean;
    reason: string;
    pattern: SprayPoint2D[];
};

const STAND_MOVEMENT = {
    onFloor: true,
    crouching: false,
    walking: false,
    horizontalSpeed: 0,
    verticalSpeed: 0,
    speed01: 0,
    landingImpact: 0,
    airborneTime: 0,
};

const WALL_SCALE = 26;
const SPRAY_SEED_TAG = 'spray-csgo128';

export const SPRAY_LAB_WEAPON_IDS = [
    'glock18',
    'usp_s',
    'deagle',
    'mac10',
    'mp9',
    'p90',
    'ak47',
    'm4a1_s',
    'sg553',
    'aug',
    'awp',
    'xm1014',
    'negev',
] as const;

export const SPRAY_LAB_VALIDATION_WEAPON_IDS = [
    'ak47',
    'm4a1_s',
    'mp9',
] as const;

export const SPRAY_LAB_DISTANCES: SprayDistanceMeters[] = [10, 20];

export const SPRAY_LAB_SCOPED_WEAPONS = new Set<string>(['aug', 'sg553', 'awp']);

const normalizeWeaponId = (value: string) => `${value || ''}`.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

export const isScopedStateSupported = (weaponId: string) => SPRAY_LAB_SCOPED_WEAPONS.has(normalizeWeaponId(weaponId));

export const getMagazineSize = (weaponId: string) => {
    const entry = getWeaponEntry(weaponId);
    return Math.max(1, Math.floor(Number(entry?.stats.magazine) || 30));
};

export const normalizePatternToFirstShot = (points: SprayPoint2D[]): SprayPoint2D[] => {
    if (!points.length) return [];
    const first = points[0];
    return points.map((point, index) => ({
        shotIndex: point.shotIndex || index + 1,
        x: point.x - first.x,
        y: point.y - first.y,
    }));
};

export const simulateSprayPattern = (args: {
    weaponId: string;
    state: SprayScopeState;
    distance: SprayDistanceMeters;
    shots?: number;
}): SprayPoint2D[] => {
    const weaponId = normalizeWeaponId(args.weaponId);
    const entry = getWeaponEntry(weaponId);
    const profile = resolveCombatProfile(weaponId);
    const scoped = args.state === 'scoped' && isScopedStateSupported(weaponId);
    const rpm = Number(entry?.stats.rpm);
    const fireRate = Math.max(0.04, (rpm > 0 ? (60 / rpm) : 0) || Number(entry?.stats.fireRate) || 0.1);
    const recoilControl = Math.max(1, Number(entry?.stats.recoilControl) || 4);
    const shots = Math.max(1, Math.floor(Number(args.shots) || getMagazineSize(weaponId)));

    const points: SprayPoint2D[] = [];
    const seed = seedFromWeapon(weaponId, SPRAY_SEED_TAG);
    let recoilIndex = 0;
    let recoverLine = 0;
    let timeSinceLastShotSeconds = 999;

    for (let i = 0; i < shots; i++) {
        const shot = computeShot({
            profileOrName: profile,
            movement: STAND_MOVEMENT,
            recoilIndex,
            recoverLine,
            weaponSeed: seed,
            shotCounter: i,
            recoilControl,
            accurateRange: Math.max(2, Number(entry?.stats.accurateRange) || 120),
            timeSinceLastShotSeconds,
            scoped,
        });

        points.push({
            shotIndex: i + 1,
            x: shot.spreadX * args.distance * WALL_SCALE,
            y: -shot.spreadY * args.distance * WALL_SCALE,
        });

        recoilIndex = shot.nextRecoilIndex;
        recoverLine = shot.nextRecoverLine;

        const recovery = recoverRecoil({
            profileOrName: profile,
            deltaTime: fireRate,
            triggerDown: true,
            recoilIndex,
            recoverLine,
            pitchDebt: 0,
            yawDebt: 0,
        });

        recoilIndex = recovery.nextRecoilIndex;
        recoverLine = recovery.nextRecoverLine;
        timeSinceLastShotSeconds = fireRate;
    }

    return normalizePatternToFirstShot(points);
};

export const getReferencePattern = (
    referenceMap: SprayReferenceMap | null | undefined,
    weaponIdRaw: string,
    state: SprayScopeState,
    distance: SprayDistanceMeters,
    shotCount?: number,
): SprayPoint2D[] => {
    const weaponId = normalizeWeaponId(weaponIdRaw);
    const rawPoints = referenceMap
        && referenceMap[weaponId]
        && referenceMap[weaponId][state]
        && referenceMap[weaponId][state]![`${distance}`];

    if (Array.isArray(rawPoints) && rawPoints.length) {
        const mapped = rawPoints.map((point, index) => ({
            shotIndex: index + 1,
            x: Number(point?.x) || 0,
            y: Number(point?.y) || 0,
        }));
        const normalized = normalizePatternToFirstShot(mapped);
        if (shotCount && shotCount > 0) return normalized.slice(0, shotCount);
        return normalized;
    }

    const fallback = simulateSprayPattern({
        weaponId,
        state,
        distance,
        shots: shotCount,
    });
    return fallback;
};

export const getReferencePatternStrict = (
    referenceMap: SprayReferenceMap | null | undefined,
    weaponIdRaw: string,
    state: SprayScopeState,
    distance: SprayDistanceMeters,
    shotCount?: number,
): SprayReferenceLookup => {
    const weaponId = normalizeWeaponId(weaponIdRaw);
    const weaponBucket = referenceMap?.[weaponId];
    if (!weaponBucket) {
        return {
            found: false,
            reason: `reference missing for weapon ${weaponId}`,
            pattern: [],
        };
    }

    const stateBucket = weaponBucket[state];
    if (!stateBucket) {
        return {
            found: false,
            reason: `reference missing for state ${state}`,
            pattern: [],
        };
    }

    const rawPoints = stateBucket[`${distance}`];
    if (!Array.isArray(rawPoints) || !rawPoints.length) {
        return {
            found: false,
            reason: `reference missing for distance ${distance}m`,
            pattern: [],
        };
    }

    const mapped = rawPoints.map((point, index) => ({
        shotIndex: index + 1,
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
    }));
    const normalized = normalizePatternToFirstShot(mapped);
    if (shotCount && shotCount > normalized.length) {
        return {
            found: false,
            reason: `reference shot count too short (${normalized.length}/${shotCount})`,
            pattern: normalized,
        };
    }

    return {
        found: true,
        reason: 'ok',
        pattern: shotCount && shotCount > 0 ? normalized.slice(0, shotCount) : normalized,
    };
};

const rmse = (values: number[]) => {
    if (!values.length) return 0;
    const sum = values.reduce((acc, value) => acc + (value * value), 0);
    return Math.sqrt(sum / values.length);
};

export const compareSprayPattern = (args: {
    weaponId: string;
    state: SprayScopeState;
    distance: SprayDistanceMeters;
    current: SprayPoint2D[];
    reference: SprayPoint2D[];
}): SprayMetricSummary => {
    const weaponId = normalizeWeaponId(args.weaponId);
    const classification = `${resolveCombatProfile(weaponId).classification || ''}`.toLowerCase();
    const current = normalizePatternToFirstShot(args.current);
    const reference = normalizePatternToFirstShot(args.reference);
    const samples = Math.min(current.length, reference.length);

    const deltas: number[] = [];
    const distanceNorm = Math.max(0.5, Number(args.distance) / 10);
    for (let i = 0; i < samples; i++) {
        const dx = (current[i].x - reference[i].x) / distanceNorm;
        const dy = (current[i].y - reference[i].y) / distanceNorm;
        deltas.push(Math.hypot(dx, dy));
    }

    const first10 = deltas.slice(0, Math.min(10, deltas.length));
    const first30 = deltas.slice(0, Math.min(30, deltas.length));
    const rmseFirst10 = rmse(first10);
    const rmseAll = rmse(deltas);
    const rmseFirst30 = rmse(first30);
    const maxError = deltas.length ? Math.max(...deltas) : 0;

    let thresholds: SprayMetricSummary['thresholds'];
    if (classification === 'machinegun') {
        thresholds = { rmseFirst30: 3.5, rmseAll: 7.5, max: 12 };
    } else if (classification === 'sniper') {
        thresholds = { rmseAll: 2.5, max: 5.5 };
    } else if (classification === 'shotgun') {
        thresholds = { rmseAll: 6.5, max: 12 };
    } else {
        thresholds = { rmseFirst10: 2.0, rmseAll: 4.0, max: 9.0 };
    }

    const pass =
        (thresholds.rmseFirst10 === undefined || rmseFirst10 <= thresholds.rmseFirst10)
        && (thresholds.rmseFirst30 === undefined || rmseFirst30 <= thresholds.rmseFirst30)
        && rmseAll <= thresholds.rmseAll
        && maxError <= thresholds.max;

    return {
        weaponId,
        classification,
        state: args.state,
        distance: args.distance,
        sampleCount: samples,
        rmseFirst10,
        rmseAll,
        rmseFirst30,
        maxError,
        pass,
        thresholds,
    };
};
