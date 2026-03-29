import { MathUtils } from 'three';
import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';
import { getRuntimeWeaponTune } from '@src/gameplay/tuning/RuntimeTuning';
import sprayPatternFromGifJson from './sprayPattern.fromGif.csgo128.json';

export type HitgroupName = 'HEAD' | 'CHEST' | 'STOMACH' | 'ARM' | 'LEG';

export type MovementCombatSnapshot = {
    onFloor: boolean;
    crouching: boolean;
    walking: boolean;
    horizontalSpeed: number;
    verticalSpeed: number;
    speed01: number;
    landingImpact: number;
    airborneTime: number;
};

export type DamageBreakdown = {
    rawDamage: number;
    healthDamage: number;
    armorDamage: number;
};

export type CombatProfileDamage = {
    baseDamage: number;
    rangeModifier: number;
    armorRatio: number;
    headMultiplier: number;
    stomachMultiplier: number;
    legMultiplier: number;
    effectivePellets?: number;
    isKnife?: boolean;
};

export type CombatProfileAccuracy = {
    standInaccuracy: number;
    moveInaccuracy: number;
    crouchMultiplier: number;
    walkMultiplier: number;
    airInaccuracy: number;
    landingPenalty: number;
    firstShotMultiplier: number;
    recoilPerShot: number;
    recoilSpreadGain: number;
    recoilMax: number;
    recoveryRate: number;
    recoveryWhileHoldingMultiplier: number;
    randomSpreadMultiplier: number;
    patternSpreadWeight: number;
    sprayJitterExponent: number;
};

export type CombatProfileRecoil = {
    basePitch: number;
    patternPitch: number;
    patternYaw: number;
    movementKickScale: number;
    cameraRecoverRate: number;
    resetAfterSeconds: number;
    pattern: Array<{ x: number; y: number }>;
};

export type CombatProfileBot = {
    burstMin: number;
    burstMax: number;
    shotDelay: number;
    burstCooldownMin: number;
    burstCooldownMax: number;
    spreadStanding: number;
    spreadMoving: number;
    recoilPerShot: number;
    recoilRecover: number;
};

export type CombatProfile = {
    id: string;
    aliases: string[];
    classification: string;
    rpm: number;
    tracerSpeed: number;
    damage: CombatProfileDamage;
    accuracy: CombatProfileAccuracy;
    recoil: CombatProfileRecoil;
    scoped?: {
        accuracy?: Partial<CombatProfileAccuracy>;
        recoil?: Partial<CombatProfileRecoil>;
    };
    movement: {
        speed: number;
        walkSpeedMul: number;
    };
    bot: CombatProfileBot;
};

type CombatProfileOverride = {
    aliases?: string[];
    classification?: string;
    rpm?: number;
    tracerSpeed?: number;
    damage?: Partial<CombatProfileDamage>;
    accuracy?: Partial<CombatProfileAccuracy>;
    recoil?: Partial<CombatProfileRecoil>;
    scoped?: {
        accuracy?: Partial<CombatProfileAccuracy>;
        recoil?: Partial<CombatProfileRecoil>;
    };
    movement?: Partial<{
        speed: number;
        walkSpeedMul: number;
    }>;
    bot?: Partial<CombatProfileBot>;
};

export type ShotComputation = {
    spreadX: number;
    spreadY: number;
    cameraPitchKick: number;
    cameraYawKick: number;
    nextRecoilIndex: number;
    nextRecoverLine: number;
};

export type RecoilRecoveryResult = {
    nextRecoilIndex: number;
    nextRecoverLine: number;
    pitchRecover: number;
    yawRecover: number;
    nextPitchDebt: number;
    nextYawDebt: number;
};

export type AkRuntimeTune = {
    cameraKickMul: number;
    randomSpreadMul: number;
    patternScaleMul: number;
    recoveryMul: number;
};

const CSGO_UNITS_PER_WORLD = 32;
const CSGO_ARMOR_BONUS_RATIO = 0.5;

const DEFAULT_AK_RUNTIME_TUNE: AkRuntimeTune = {
    cameraKickMul: 1.08,
    randomSpreadMul: 0.78,
    patternScaleMul: 1.14,
    recoveryMul: 0.92,
};

let akRuntimeTune: AkRuntimeTune = { ...DEFAULT_AK_RUNTIME_TUNE };

export const getAkRuntimeTune = (): AkRuntimeTune => ({ ...akRuntimeTune });

export const setAkRuntimeTune = (partial: Partial<AkRuntimeTune>) => {
    akRuntimeTune = {
        cameraKickMul: MathUtils.clamp(Number(partial.cameraKickMul ?? akRuntimeTune.cameraKickMul), 0.4, 2.2),
        randomSpreadMul: MathUtils.clamp(Number(partial.randomSpreadMul ?? akRuntimeTune.randomSpreadMul), 0.25, 2.2),
        patternScaleMul: MathUtils.clamp(Number(partial.patternScaleMul ?? akRuntimeTune.patternScaleMul), 0.45, 1.9),
        recoveryMul: MathUtils.clamp(Number(partial.recoveryMul ?? akRuntimeTune.recoveryMul), 0.45, 2.1),
    };
    return { ...akRuntimeTune };
};

export const resetAkRuntimeTune = () => {
    akRuntimeTune = { ...DEFAULT_AK_RUNTIME_TUNE };
    return { ...akRuntimeTune };
};

const RIFLE_PATTERN: Array<{ x: number; y: number }> = [
    { x: 0, y: 1.0 }, { x: -0.08, y: 1.24 }, { x: 0.1, y: 1.3 }, { x: -0.16, y: 1.38 }, { x: 0.17, y: 1.42 },
    { x: -0.2, y: 1.5 }, { x: 0.22, y: 1.56 }, { x: -0.25, y: 1.62 }, { x: 0.24, y: 1.65 }, { x: -0.22, y: 1.68 },
    { x: 0.2, y: 1.7 }, { x: -0.16, y: 1.68 }, { x: 0.15, y: 1.66 }, { x: -0.14, y: 1.64 }, { x: 0.13, y: 1.62 },
    { x: -0.12, y: 1.58 }, { x: 0.11, y: 1.55 }, { x: -0.1, y: 1.5 }, { x: 0.09, y: 1.46 }, { x: -0.08, y: 1.42 },
];

const SMG_PATTERN: Array<{ x: number; y: number }> = [
    { x: 0, y: 0.9 }, { x: -0.05, y: 1.02 }, { x: 0.08, y: 1.1 }, { x: -0.1, y: 1.14 }, { x: 0.11, y: 1.18 },
    { x: -0.12, y: 1.22 }, { x: 0.13, y: 1.26 }, { x: -0.14, y: 1.28 }, { x: 0.15, y: 1.3 }, { x: -0.16, y: 1.32 },
    { x: 0.15, y: 1.34 }, { x: -0.14, y: 1.34 }, { x: 0.13, y: 1.33 }, { x: -0.12, y: 1.32 }, { x: 0.11, y: 1.3 },
];

const PISTOL_PATTERN: Array<{ x: number; y: number }> = [
    { x: 0, y: 1.0 }, { x: -0.04, y: 1.05 }, { x: 0.05, y: 1.1 }, { x: -0.06, y: 1.14 }, { x: 0.07, y: 1.18 },
    { x: -0.07, y: 1.2 }, { x: 0.06, y: 1.2 }, { x: -0.05, y: 1.18 },
];

const SNIPER_PATTERN: Array<{ x: number; y: number }> = [
    { x: 0, y: 1.2 }, { x: 0.02, y: 1.05 }, { x: -0.02, y: 1.0 },
];

const SHOTGUN_PATTERN: Array<{ x: number; y: number }> = [
    { x: 0, y: 1.08 }, { x: -0.04, y: 1.12 }, { x: 0.04, y: 1.1 }, { x: -0.03, y: 1.06 },
];

const MACHINEGUN_PATTERN: Array<{ x: number; y: number }> = [
    { x: 0, y: 1.0 }, { x: -0.08, y: 1.12 }, { x: 0.1, y: 1.2 }, { x: -0.14, y: 1.28 }, { x: 0.15, y: 1.34 },
    { x: -0.17, y: 1.4 }, { x: 0.18, y: 1.45 }, { x: -0.18, y: 1.5 }, { x: 0.17, y: 1.55 }, { x: -0.15, y: 1.6 },
    { x: 0.14, y: 1.62 }, { x: -0.13, y: 1.64 }, { x: 0.12, y: 1.64 }, { x: -0.11, y: 1.63 }, { x: 0.1, y: 1.62 },
    { x: -0.09, y: 1.6 }, { x: 0.08, y: 1.58 }, { x: -0.07, y: 1.54 }, { x: 0.06, y: 1.5 }, { x: -0.05, y: 1.45 },
];

const scalePattern = (pattern: Array<{ x: number; y: number }>, xMul: number, yMul: number) =>
    pattern.map((point) => ({
        x: point.x * xMul,
        y: 1 + ((point.y - 1) * yMul),
    }));

const GIF_PATTERN_BY_ID = (
    sprayPatternFromGifJson && typeof sprayPatternFromGifJson === 'object'
        ? (sprayPatternFromGifJson as { patterns?: Record<string, Array<{ x: number; y: number }>> }).patterns
        : undefined
) || {};

const sanitizePatternPoint = (raw: unknown, fallback: { x: number; y: number }) => {
    const x = Number((raw as { x?: unknown })?.x);
    const y = Number((raw as { y?: unknown })?.y);
    return {
        x: Number.isFinite(x) ? MathUtils.clamp(x, -1.2, 1.2) : fallback.x,
        y: Number.isFinite(y) ? MathUtils.clamp(y, 0.7, 3.6) : fallback.y,
    };
};

const resolvePatternFromGif = (key: string, fallback: Array<{ x: number; y: number }>) => {
    const raw = GIF_PATTERN_BY_ID[key];
    if (!Array.isArray(raw) || raw.length === 0) return fallback;
    const safeFallback = fallback.length ? fallback : [{ x: 0, y: 1 }];
    return raw.map((point, index) =>
        sanitizePatternPoint(point, safeFallback[Math.min(index, safeFallback.length - 1)]),
    );
};

const limitPatternStep = (
    pattern: Array<{ x: number; y: number }>,
    capByIndex: (index: number) => number,
) => {
    if (!Array.isArray(pattern) || pattern.length < 2) return pattern;
    const out: Array<{ x: number; y: number }> = [{ ...pattern[0] }];
    for (let i = 1; i < pattern.length; i++) {
        const prev = out[i - 1];
        const curr = pattern[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.hypot(dx, dy);
        const cap = Math.max(0.02, capByIndex(i));
        if (dist <= cap || dist === 0) {
            out.push({ ...curr });
            continue;
        }
        const scale = cap / dist;
        out.push({
            x: prev.x + (dx * scale),
            y: prev.y + (dy * scale),
        });
    }
    return out;
};

const interpolatePatternAnchors = (
    anchors: Array<{ shot: number; x: number; y: number }>,
    totalShots: number,
) => {
    if (!anchors.length || totalShots <= 0) return [] as Array<{ x: number; y: number }>;
    const sorted = [...anchors].sort((a, b) => a.shot - b.shot);
    const points: Array<{ x: number; y: number }> = [];
    for (let shot = 1; shot <= totalShots; shot++) {
        let left = sorted[0];
        let right = sorted[sorted.length - 1];
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].shot <= shot) left = sorted[i];
            if (sorted[i].shot >= shot) {
                right = sorted[i];
                break;
            }
        }
        if (left.shot === right.shot) {
            points.push({ x: left.x, y: left.y });
            continue;
        }
        const t = MathUtils.clamp((shot - left.shot) / Math.max(1, right.shot - left.shot), 0, 1);
        points.push({
            x: MathUtils.lerp(left.x, right.x, t),
            y: MathUtils.lerp(left.y, right.y, t),
        });
    }
    return points;
};

const M4A1S_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 1.0 }, { x: 0.018, y: 1.11 }, { x: 0.03, y: 1.2 }, { x: 0.04, y: 1.29 }, { x: 0.046, y: 1.37 },
    { x: 0.052, y: 1.44 }, { x: 0.058, y: 1.5 }, { x: 0.06, y: 1.56 }, { x: 0.06, y: 1.61 }, { x: 0.056, y: 1.66 },
    { x: 0.02, y: 1.71 }, { x: -0.04, y: 1.75 }, { x: -0.09, y: 1.79 }, { x: -0.14, y: 1.82 }, { x: -0.18, y: 1.85 },
    { x: -0.2, y: 1.88 }, { x: -0.19, y: 1.9 }, { x: -0.15, y: 1.92 }, { x: -0.08, y: 1.94 }, { x: -0.02, y: 1.96 },
    { x: 0.03, y: 1.98 }, { x: 0.06, y: 1.99 }, { x: 0.07, y: 2.0 }, { x: 0.06, y: 2.01 }, { x: 0.04, y: 2.02 },
];
const SG553_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 1.0 }, { x: 0.05, y: 1.14 }, { x: 0.09, y: 1.27 }, { x: 0.13, y: 1.39 }, { x: 0.17, y: 1.5 },
    { x: 0.2, y: 1.6 }, { x: 0.22, y: 1.69 }, { x: 0.23, y: 1.77 }, { x: 0.2, y: 1.84 }, { x: 0.15, y: 1.9 },
    { x: 0.08, y: 1.95 }, { x: 0.0, y: 1.99 }, { x: -0.08, y: 2.02 }, { x: -0.15, y: 2.05 }, { x: -0.2, y: 2.08 },
    { x: -0.23, y: 2.1 }, { x: -0.24, y: 2.11 }, { x: -0.2, y: 2.12 }, { x: -0.14, y: 2.13 }, { x: -0.06, y: 2.14 },
    { x: 0.01, y: 2.15 }, { x: 0.07, y: 2.16 }, { x: 0.11, y: 2.17 }, { x: 0.12, y: 2.18 }, { x: 0.1, y: 2.18 },
    { x: 0.05, y: 2.19 }, { x: 0.0, y: 2.19 }, { x: -0.04, y: 2.2 }, { x: -0.07, y: 2.2 }, { x: -0.08, y: 2.2 },
];
const AUG_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 1.0 }, { x: -0.03, y: 1.12 }, { x: -0.06, y: 1.22 }, { x: -0.09, y: 1.31 }, { x: -0.11, y: 1.4 },
    { x: -0.13, y: 1.48 }, { x: -0.15, y: 1.56 }, { x: -0.14, y: 1.63 }, { x: -0.1, y: 1.69 }, { x: -0.04, y: 1.75 },
    { x: 0.03, y: 1.8 }, { x: 0.11, y: 1.85 }, { x: 0.18, y: 1.89 }, { x: 0.23, y: 1.93 }, { x: 0.25, y: 1.96 },
    { x: 0.24, y: 1.99 }, { x: 0.2, y: 2.01 }, { x: 0.14, y: 2.03 }, { x: 0.07, y: 2.05 }, { x: 0.01, y: 2.07 },
    { x: -0.04, y: 2.08 }, { x: -0.08, y: 2.09 }, { x: -0.11, y: 2.1 }, { x: -0.12, y: 2.11 }, { x: -0.1, y: 2.12 },
    { x: -0.06, y: 2.13 }, { x: -0.02, y: 2.14 }, { x: 0.01, y: 2.14 }, { x: 0.03, y: 2.15 }, { x: 0.04, y: 2.15 },
];
const MP9_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 0.92 }, { x: -0.03, y: 1.0 }, { x: -0.06, y: 1.08 }, { x: -0.1, y: 1.16 }, { x: -0.13, y: 1.23 },
    { x: -0.16, y: 1.29 }, { x: -0.17, y: 1.34 }, { x: -0.16, y: 1.38 }, { x: -0.13, y: 1.42 }, { x: -0.09, y: 1.45 },
    { x: -0.04, y: 1.48 }, { x: 0.0, y: 1.5 }, { x: 0.03, y: 1.52 }, { x: 0.05, y: 1.54 }, { x: 0.06, y: 1.56 },
    { x: 0.06, y: 1.58 }, { x: 0.05, y: 1.6 }, { x: 0.03, y: 1.61 }, { x: 0.01, y: 1.62 }, { x: -0.01, y: 1.63 },
    { x: -0.03, y: 1.64 }, { x: -0.04, y: 1.65 }, { x: -0.04, y: 1.65 }, { x: -0.03, y: 1.66 }, { x: -0.01, y: 1.66 },
    { x: 0.01, y: 1.67 }, { x: 0.02, y: 1.67 }, { x: 0.02, y: 1.67 }, { x: 0.01, y: 1.68 }, { x: 0.0, y: 1.68 },
];
const MAC10_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 0.9 }, { x: -0.04, y: 1.0 }, { x: -0.08, y: 1.1 }, { x: -0.12, y: 1.19 }, { x: -0.16, y: 1.27 },
    { x: -0.2, y: 1.34 }, { x: -0.23, y: 1.4 }, { x: -0.25, y: 1.45 }, { x: -0.26, y: 1.49 }, { x: -0.27, y: 1.53 },
    { x: -0.28, y: 1.56 }, { x: -0.28, y: 1.59 }, { x: -0.25, y: 1.62 }, { x: -0.21, y: 1.64 }, { x: -0.16, y: 1.66 },
    { x: -0.1, y: 1.68 }, { x: -0.04, y: 1.7 }, { x: 0.01, y: 1.72 }, { x: 0.05, y: 1.73 }, { x: 0.08, y: 1.74 },
    { x: 0.1, y: 1.75 }, { x: 0.11, y: 1.76 }, { x: 0.1, y: 1.77 }, { x: 0.08, y: 1.78 }, { x: 0.05, y: 1.79 },
    { x: 0.01, y: 1.8 }, { x: -0.03, y: 1.81 }, { x: -0.06, y: 1.81 }, { x: -0.08, y: 1.82 }, { x: -0.09, y: 1.82 },
];
const P90_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 0.9 }, { x: -0.02, y: 0.99 }, { x: -0.04, y: 1.08 }, { x: -0.05, y: 1.16 }, { x: -0.04, y: 1.24 },
    { x: -0.02, y: 1.31 }, { x: 0.0, y: 1.37 }, { x: 0.02, y: 1.43 }, { x: 0.03, y: 1.48 }, { x: 0.04, y: 1.52 },
    { x: 0.03, y: 1.56 }, { x: 0.01, y: 1.6 }, { x: -0.02, y: 1.63 }, { x: -0.05, y: 1.66 }, { x: -0.07, y: 1.69 },
    { x: -0.08, y: 1.72 }, { x: -0.05, y: 1.74 }, { x: 0.0, y: 1.76 }, { x: 0.06, y: 1.78 }, { x: 0.1, y: 1.8 },
    { x: 0.07, y: 1.82 }, { x: 0.01, y: 1.84 }, { x: -0.06, y: 1.86 }, { x: -0.11, y: 1.88 }, { x: -0.07, y: 1.89 },
    { x: 0.01, y: 1.9 }, { x: 0.09, y: 1.91 }, { x: 0.12, y: 1.92 }, { x: 0.06, y: 1.93 }, { x: -0.02, y: 1.94 },
];
const NEGEV_PATTERN_FALLBACK: Array<{ x: number; y: number }> = [
    { x: 0.0, y: 1.0 }, { x: -0.03, y: 1.28 }, { x: 0.04, y: 1.5 }, { x: -0.06, y: 1.68 }, { x: 0.08, y: 1.82 },
    { x: -0.1, y: 1.94 }, { x: 0.12, y: 2.03 }, { x: -0.14, y: 2.1 }, { x: 0.16, y: 2.15 }, { x: -0.18, y: 2.19 },
    { x: 0.2, y: 2.22 }, { x: -0.22, y: 2.24 }, { x: 0.24, y: 2.26 }, { x: -0.26, y: 2.27 }, { x: 0.28, y: 2.28 },
    { x: -0.3, y: 2.29 }, { x: 0.32, y: 2.3 }, { x: -0.34, y: 2.31 }, { x: 0.36, y: 2.31 }, { x: -0.38, y: 2.32 },
    { x: 0.4, y: 2.32 }, { x: -0.36, y: 2.33 }, { x: 0.32, y: 2.33 }, { x: -0.28, y: 2.33 }, { x: 0.24, y: 2.34 },
    { x: -0.2, y: 2.34 }, { x: 0.16, y: 2.34 }, { x: -0.12, y: 2.34 }, { x: 0.08, y: 2.35 }, { x: -0.04, y: 2.35 },
    { x: 0.0, y: 2.35 },
];

const AK_CSGO_PHASE_ANCHORS: Array<{ shot: number; x: number; y: number }> = [
    // Phase 1 (1-5): fast vertical rise, near-zero horizontal.
    { shot: 1, x: 0.0, y: 1.0 },
    { shot: 2, x: 0.002, y: 1.02 },
    { shot: 3, x: 0.006, y: 1.09 },
    { shot: 4, x: 0.011, y: 1.16 },
    { shot: 5, x: -0.001, y: 1.215 },
    // Phase 2 (6-10): vertical rise slows, horizontal bends.
    { shot: 6, x: -0.016, y: 1.27 },
    { shot: 7, x: -0.03, y: 1.326 },
    { shot: 8, x: -0.045, y: 1.38 },
    { shot: 9, x: -0.054, y: 1.436 },
    { shot: 10, x: -0.061, y: 1.491 },
    // Phase 3 (11-22): vertical saturation, strong lateral swing.
    { shot: 11, x: -0.075, y: 1.546 },
    { shot: 12, x: -0.096, y: 1.601 },
    { shot: 15, x: -0.161, y: 1.691 },
    { shot: 18, x: -0.125, y: 1.815 },
    { shot: 20, x: 0.021, y: 1.868 },
    { shot: 22, x: 0.133, y: 1.931 },
    // Phase 4 (23-30): horizontal return towards center/right while Y is near clamp.
    { shot: 23, x: 0.197, y: 1.967 },
    { shot: 25, x: 0.331, y: 2.031 },
    { shot: 27, x: 0.202, y: 2.067 },
    { shot: 30, x: -0.039, y: 2.086 },
];

const AK_PHASE_PATTERN_BASE = interpolatePatternAnchors(AK_CSGO_PHASE_ANCHORS, 30).map((point, index) => {
    const shot = index + 1;
    const y = shot > 10
        ? Math.min(2.1, Math.max(1.52, point.y))
        : point.y;
    return {
        x: MathUtils.clamp(point.x, -1.2, 1.2),
        y: MathUtils.clamp(y, 0.7, 3.2),
    };
});

const AK_PATTERN = limitPatternStep(
    AK_PHASE_PATTERN_BASE,
    (index) => (index <= 10 ? 0.16 : (index <= 22 ? 0.22 : 0.2)),
);
const M4A1S_PATTERN = resolvePatternFromGif('m4a1_s', M4A1S_PATTERN_FALLBACK);
const SG553_PATTERN = resolvePatternFromGif('sg553', SG553_PATTERN_FALLBACK);
const SG553_SCOPED_PATTERN = resolvePatternFromGif('sg553_scoped', scalePattern(SG553_PATTERN_FALLBACK, 0.72, 0.83));
const AUG_PATTERN = resolvePatternFromGif('aug', AUG_PATTERN_FALLBACK);
const AUG_SCOPED_PATTERN = resolvePatternFromGif('aug_scoped', scalePattern(AUG_PATTERN_FALLBACK, 0.7, 0.82));
const MP9_PATTERN = resolvePatternFromGif('mp9', MP9_PATTERN_FALLBACK);
const MAC10_PATTERN = resolvePatternFromGif('mac10', MAC10_PATTERN_FALLBACK);
const P90_PATTERN = resolvePatternFromGif('p90', P90_PATTERN_FALLBACK);
const NEGEV_PATTERN = resolvePatternFromGif('negev', NEGEV_PATTERN_FALLBACK);

const DEFAULT_ACCURACY: CombatProfileAccuracy = {
    standInaccuracy: 0.0038,
    moveInaccuracy: 0.018,
    crouchMultiplier: 0.78,
    walkMultiplier: 0.64,
    airInaccuracy: 0.19,
    landingPenalty: 0.12,
    firstShotMultiplier: 0.42,
    recoilPerShot: 1.0,
    recoilSpreadGain: 0.0019,
    recoilMax: 22,
    recoveryRate: 8.4,
    recoveryWhileHoldingMultiplier: 0.48,
    randomSpreadMultiplier: 0.032,
    patternSpreadWeight: 0.96,
    sprayJitterExponent: 2.45,
};

const DEFAULT_RECOIL: CombatProfileRecoil = {
    basePitch: 0.0048,
    patternPitch: 0.0038,
    patternYaw: 0.0042,
    movementKickScale: 0.22,
    cameraRecoverRate: 16.5,
    resetAfterSeconds: 0.42,
    pattern: RIFLE_PATTERN,
};

const DEFAULT_DAMAGE: CombatProfileDamage = {
    baseDamage: 30,
    rangeModifier: 0.96,
    armorRatio: 1.3,
    headMultiplier: 4.0,
    stomachMultiplier: 1.25,
    legMultiplier: 0.75,
};

const DEFAULT_BOT: CombatProfileBot = {
    burstMin: 3,
    burstMax: 5,
    shotDelay: 0.11,
    burstCooldownMin: 0.24,
    burstCooldownMax: 0.46,
    spreadStanding: 0.1,
    spreadMoving: 0.16,
    recoilPerShot: 0.035,
    recoilRecover: 0.24,
};

const profile = (
    id: string,
    partial: CombatProfileOverride,
): CombatProfile => ({
    id,
    aliases: partial.aliases || [],
    classification: partial.classification || 'rifle',
    rpm: Math.max(10, Number(partial.rpm) || 600),
    tracerSpeed: Math.max(0, Number(partial.tracerSpeed) || 3200),
    damage: { ...DEFAULT_DAMAGE, ...(partial.damage || {}) },
    accuracy: { ...DEFAULT_ACCURACY, ...(partial.accuracy || {}) },
    recoil: { ...DEFAULT_RECOIL, ...(partial.recoil || {}) },
    scoped: partial.scoped
        ? {
            accuracy: partial.scoped.accuracy ? { ...partial.scoped.accuracy } : undefined,
            recoil: partial.scoped.recoil ? { ...partial.scoped.recoil } : undefined,
        }
        : undefined,
    movement: {
        speed: partial.movement?.speed || 220,
        walkSpeedMul: partial.movement?.walkSpeedMul || 0.52,
    },
    bot: { ...DEFAULT_BOT, ...(partial.bot || {}) },
});

const COMBAT_PROFILES: CombatProfile[] = [
    profile('ak47', {
        aliases: ['ak', 'ak47', 'ak-47'],
        classification: 'rifle',
        rpm: 600,
        tracerSpeed: 715,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 36, rangeModifier: 0.98, armorRatio: 1.55 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0019,
            moveInaccuracy: 0.0182,
            crouchMultiplier: 0.66,
            walkMultiplier: 0.61,
            airInaccuracy: 0.255,
            landingPenalty: 0.135,
            firstShotMultiplier: 0.075,
            recoilPerShot: 1.0,
            recoilSpreadGain: 0.000018,
            recoilMax: 30,
            recoveryRate: 7.5,
            recoveryWhileHoldingMultiplier: 0.0,
            randomSpreadMultiplier: 0.0048,
            patternSpreadWeight: 0.989,
            sprayJitterExponent: 2.55,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.00505,
            patternPitch: 0.00405,
            patternYaw: 0.00265,
            movementKickScale: 0.22,
            cameraRecoverRate: 14.6,
            resetAfterSeconds: 0.41,
            pattern: AK_PATTERN,
        },
        movement: { speed: 215, walkSpeedMul: 0.521 },
        bot: { ...DEFAULT_BOT, burstMin: 3, burstMax: 5, shotDelay: 0.104, spreadStanding: 0.082, spreadMoving: 0.136, recoilPerShot: 0.03, recoilRecover: 0.235 },
    }),
    profile('m4a1_s', {
        aliases: ['m4a1s', 'm4a1-s', 'm4a1'],
        classification: 'rifle',
        rpm: 600,
        tracerSpeed: 3500,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 38, rangeModifier: 0.97, armorRatio: 1.4 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0014,
            moveInaccuracy: 0.0172,
            crouchMultiplier: 0.64,
            walkMultiplier: 0.61,
            airInaccuracy: 0.21,
            landingPenalty: 0.11,
            firstShotMultiplier: 0.09,
            recoilPerShot: 0.92,
            recoilSpreadGain: 0.0008,
            recoilMax: 25,
            recoveryRate: 8.9,
            recoveryWhileHoldingMultiplier: 0.45,
            randomSpreadMultiplier: 0.021,
            patternSpreadWeight: 0.988,
            sprayJitterExponent: 2.6,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0036,
            patternPitch: 0.0028,
            patternYaw: 0.0018,
            movementKickScale: 0.2,
            cameraRecoverRate: 18.8,
            resetAfterSeconds: 0.34,
            pattern: M4A1S_PATTERN,
        },
        movement: { speed: 225, walkSpeedMul: 0.56 },
        bot: { ...DEFAULT_BOT, burstMin: 3, burstMax: 5, shotDelay: 0.101, spreadStanding: 0.074, spreadMoving: 0.122, recoilPerShot: 0.027, recoilRecover: 0.255 },
    }),
    profile('sg553', {
        aliases: ['sg553', 'sg', 'krieg'],
        classification: 'rifle',
        rpm: 545,
        tracerSpeed: 3600,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 30, rangeModifier: 0.98, armorRatio: 2.0 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0021,
            moveInaccuracy: 0.021,
            crouchMultiplier: 0.69,
            walkMultiplier: 0.65,
            airInaccuracy: 0.22,
            landingPenalty: 0.12,
            firstShotMultiplier: 0.11,
            recoilPerShot: 0.96,
            recoilSpreadGain: 0.00058,
            recoilMax: 26,
            recoveryRate: 7.5,
            recoveryWhileHoldingMultiplier: 0.42,
            randomSpreadMultiplier: 0.027,
            patternSpreadWeight: 0.982,
            sprayJitterExponent: 2.5,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0042,
            patternPitch: 0.0035,
            patternYaw: 0.0027,
            movementKickScale: 0.23,
            cameraRecoverRate: 15.3,
            resetAfterSeconds: 0.4,
            pattern: SG553_PATTERN,
        },
        scoped: {
            accuracy: {
                standInaccuracy: 0.001,
                moveInaccuracy: 0.0105,
                airInaccuracy: 0.12,
                landingPenalty: 0.08,
                recoilSpreadGain: 0.00042,
                randomSpreadMultiplier: 0.017,
                patternSpreadWeight: 0.989,
            },
            recoil: {
                basePitch: 0.0028,
                patternPitch: 0.0025,
                patternYaw: 0.0016,
                cameraRecoverRate: 18.8,
                movementKickScale: 0.16,
                pattern: SG553_SCOPED_PATTERN,
            },
        },
        movement: { speed: 210, walkSpeedMul: 0.52 },
        bot: { ...DEFAULT_BOT, burstMin: 3, burstMax: 4, shotDelay: 0.111, spreadStanding: 0.087, spreadMoving: 0.14, recoilPerShot: 0.033, recoilRecover: 0.225 },
    }),
    profile('aug', {
        aliases: ['aug'],
        classification: 'rifle',
        rpm: 600,
        tracerSpeed: 3600,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 28, rangeModifier: 0.96, armorRatio: 1.8 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0018,
            moveInaccuracy: 0.0192,
            crouchMultiplier: 0.68,
            walkMultiplier: 0.64,
            airInaccuracy: 0.215,
            landingPenalty: 0.11,
            firstShotMultiplier: 0.1,
            recoilPerShot: 0.94,
            recoilSpreadGain: 0.00052,
            recoilMax: 24,
            recoveryRate: 8.4,
            recoveryWhileHoldingMultiplier: 0.44,
            randomSpreadMultiplier: 0.023,
            patternSpreadWeight: 0.986,
            sprayJitterExponent: 2.55,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0038,
            patternPitch: 0.0029,
            patternYaw: 0.0022,
            movementKickScale: 0.21,
            cameraRecoverRate: 17.3,
            resetAfterSeconds: 0.36,
            pattern: AUG_PATTERN,
        },
        scoped: {
            accuracy: {
                standInaccuracy: 0.00095,
                moveInaccuracy: 0.0098,
                airInaccuracy: 0.11,
                landingPenalty: 0.075,
                recoilSpreadGain: 0.00039,
                randomSpreadMultiplier: 0.015,
                patternSpreadWeight: 0.99,
            },
            recoil: {
                basePitch: 0.0025,
                patternPitch: 0.0023,
                patternYaw: 0.0014,
                cameraRecoverRate: 19.2,
                movementKickScale: 0.15,
                pattern: AUG_SCOPED_PATTERN,
            },
        },
        movement: { speed: 220, walkSpeedMul: 0.55 },
        bot: { ...DEFAULT_BOT, burstMin: 3, burstMax: 5, shotDelay: 0.103, spreadStanding: 0.078, spreadMoving: 0.129, recoilPerShot: 0.029, recoilRecover: 0.245 },
    }),
    profile('mp9', {
        aliases: ['mp9'],
        classification: 'smg',
        rpm: 857,
        tracerSpeed: 2500,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 26, rangeModifier: 0.67, armorRatio: 1.2 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.007,
            moveInaccuracy: 0.031,
            crouchMultiplier: 0.74,
            walkMultiplier: 0.71,
            airInaccuracy: 0.27,
            landingPenalty: 0.15,
            firstShotMultiplier: 0.12,
            recoilPerShot: 1.08,
            recoilSpreadGain: 0.002,
            recoilMax: 14,
            recoveryRate: 8.7,
            recoveryWhileHoldingMultiplier: 0.5,
            randomSpreadMultiplier: 0.041,
            patternSpreadWeight: 0.95,
            sprayJitterExponent: 2.2,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0034,
            patternPitch: 0.0034,
            patternYaw: 0.0031,
            movementKickScale: 0.29,
            cameraRecoverRate: 15.6,
            resetAfterSeconds: 0.31,
            pattern: MP9_PATTERN,
        },
        movement: { speed: 240, walkSpeedMul: 0.6 },
        bot: { ...DEFAULT_BOT, burstMin: 6, burstMax: 10, shotDelay: 0.071, spreadStanding: 0.118, spreadMoving: 0.192, recoilPerShot: 0.031, recoilRecover: 0.29 },
    }),
    profile('mac10', {
        aliases: ['mac10', 'mac-10'],
        classification: 'smg',
        rpm: 800,
        tracerSpeed: 2450,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 29, rangeModifier: 0.65, armorRatio: 1.15 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0058,
            moveInaccuracy: 0.0335,
            crouchMultiplier: 0.75,
            walkMultiplier: 0.72,
            airInaccuracy: 0.29,
            landingPenalty: 0.16,
            firstShotMultiplier: 0.34,
            recoilPerShot: 1.12,
            recoilSpreadGain: 0.00102,
            recoilMax: 29,
            recoveryRate: 8.2,
            recoveryWhileHoldingMultiplier: 0.5,
            randomSpreadMultiplier: 0.047,
            patternSpreadWeight: 0.945,
            sprayJitterExponent: 2.15,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0037,
            patternPitch: 0.0036,
            patternYaw: 0.0034,
            movementKickScale: 0.32,
            cameraRecoverRate: 14.6,
            resetAfterSeconds: 0.31,
            pattern: MAC10_PATTERN,
        },
        movement: { speed: 240, walkSpeedMul: 0.61 },
        bot: { ...DEFAULT_BOT, burstMin: 6, burstMax: 10, shotDelay: 0.075, spreadStanding: 0.132, spreadMoving: 0.212, recoilPerShot: 0.032, recoilRecover: 0.278 },
    }),
    profile('p90', {
        aliases: ['p90'],
        classification: 'smg',
        rpm: 857,
        tracerSpeed: 2600,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 26, rangeModifier: 0.84, armorRatio: 1.38 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0048,
            moveInaccuracy: 0.0252,
            crouchMultiplier: 0.73,
            walkMultiplier: 0.7,
            airInaccuracy: 0.255,
            landingPenalty: 0.14,
            firstShotMultiplier: 0.28,
            recoilPerShot: 0.99,
            recoilSpreadGain: 0.00078,
            recoilMax: 27,
            recoveryRate: 9.3,
            recoveryWhileHoldingMultiplier: 0.51,
            randomSpreadMultiplier: 0.035,
            patternSpreadWeight: 0.958,
            sprayJitterExponent: 2.28,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0031,
            patternPitch: 0.0029,
            patternYaw: 0.0023,
            movementKickScale: 0.27,
            cameraRecoverRate: 16.5,
            resetAfterSeconds: 0.33,
            pattern: P90_PATTERN,
        },
        movement: { speed: 230, walkSpeedMul: 0.58 },
        bot: { ...DEFAULT_BOT, burstMin: 7, burstMax: 11, shotDelay: 0.071, spreadStanding: 0.11, spreadMoving: 0.18, recoilPerShot: 0.028, recoilRecover: 0.302 },
    }),
    profile('glock18', {
        aliases: ['glock18', 'glock', 'glock-18'],
        classification: 'pistol',
        rpm: 400,
        tracerSpeed: 2000,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 30, rangeModifier: 0.9, armorRatio: 0.94 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0035,
            moveInaccuracy: 0.0188,
            crouchMultiplier: 0.79,
            walkMultiplier: 0.75,
            airInaccuracy: 0.23,
            landingPenalty: 0.13,
            firstShotMultiplier: 0.24,
            recoilPerShot: 0.78,
            recoilSpreadGain: 0.0005,
            recoilMax: 9,
            recoveryRate: 9.9,
            recoveryWhileHoldingMultiplier: 0.59,
            randomSpreadMultiplier: 0.03,
            patternSpreadWeight: 0.9,
            sprayJitterExponent: 2.35,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0036,
            patternPitch: 0.0024,
            patternYaw: 0.0018,
            movementKickScale: 0.16,
            pattern: PISTOL_PATTERN,
            cameraRecoverRate: 22.3,
            resetAfterSeconds: 0.29,
        },
        movement: { speed: 240, walkSpeedMul: 0.62 },
        bot: { ...DEFAULT_BOT, burstMin: 1, burstMax: 2, shotDelay: 0.153, burstCooldownMin: 0.18, burstCooldownMax: 0.32, spreadStanding: 0.095, spreadMoving: 0.146, recoilPerShot: 0.024, recoilRecover: 0.34 },
    }),
    profile('usp_s', {
        aliases: ['usps', 'usp', 'usp-s', 'usp_s'],
        classification: 'pistol',
        rpm: 352,
        tracerSpeed: 2100,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 35, rangeModifier: 0.91, armorRatio: 1.01 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0023,
            moveInaccuracy: 0.0141,
            crouchMultiplier: 0.77,
            walkMultiplier: 0.73,
            airInaccuracy: 0.2,
            landingPenalty: 0.11,
            firstShotMultiplier: 0.16,
            recoilPerShot: 0.7,
            recoilSpreadGain: 0.00038,
            recoilMax: 8,
            recoveryRate: 12.1,
            recoveryWhileHoldingMultiplier: 0.63,
            randomSpreadMultiplier: 0.022,
            patternSpreadWeight: 0.92,
            sprayJitterExponent: 2.5,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.003,
            patternPitch: 0.0019,
            patternYaw: 0.0015,
            movementKickScale: 0.13,
            pattern: PISTOL_PATTERN,
            cameraRecoverRate: 25.4,
            resetAfterSeconds: 0.27,
        },
        movement: { speed: 240, walkSpeedMul: 0.63 },
        bot: { ...DEFAULT_BOT, burstMin: 1, burstMax: 2, shotDelay: 0.172, burstCooldownMin: 0.2, burstCooldownMax: 0.34, spreadStanding: 0.086, spreadMoving: 0.132, recoilPerShot: 0.021, recoilRecover: 0.365 },
    }),
    profile('deagle', {
        aliases: ['deagle', 'deserteagle'],
        classification: 'pistol',
        rpm: 267,
        tracerSpeed: 2300,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 53, rangeModifier: 0.81, armorRatio: 1.864 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0032,
            moveInaccuracy: 0.0235,
            crouchMultiplier: 0.82,
            walkMultiplier: 0.78,
            airInaccuracy: 0.3,
            landingPenalty: 0.16,
            firstShotMultiplier: 0.2,
            recoilPerShot: 0.9,
            recoilSpreadGain: 0.00092,
            recoilMax: 8,
            recoveryRate: 7.1,
            recoveryWhileHoldingMultiplier: 0.6,
            randomSpreadMultiplier: 0.028,
            patternSpreadWeight: 0.88,
            sprayJitterExponent: 2.25,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0065,
            patternPitch: 0.0035,
            patternYaw: 0.0021,
            movementKickScale: 0.19,
            pattern: PISTOL_PATTERN,
            cameraRecoverRate: 14.2,
            resetAfterSeconds: 0.41,
        },
        movement: { speed: 230, walkSpeedMul: 0.57 },
        bot: { ...DEFAULT_BOT, burstMin: 1, burstMax: 1, shotDelay: 0.228, burstCooldownMin: 0.28, burstCooldownMax: 0.42, spreadStanding: 0.122, spreadMoving: 0.206, recoilPerShot: 0.034, recoilRecover: 0.262 },
    }),
    profile('awp', {
        aliases: ['awp'],
        classification: 'sniper',
        rpm: 41,
        tracerSpeed: 4500,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 115, rangeModifier: 0.99, armorRatio: 1.95 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.07,
            moveInaccuracy: 0.28,
            crouchMultiplier: 0.9,
            walkMultiplier: 0.82,
            airInaccuracy: 0.42,
            landingPenalty: 0.2,
            firstShotMultiplier: 0.85,
            recoilPerShot: 0.58,
            recoilSpreadGain: 0.0002,
            recoilMax: 4,
            recoveryRate: 3.4,
            recoveryWhileHoldingMultiplier: 0.7,
            randomSpreadMultiplier: 0.012,
            patternSpreadWeight: 0.97,
            sprayJitterExponent: 2.6,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0078,
            patternPitch: 0.0032,
            patternYaw: 0.0012,
            movementKickScale: 0.1,
            pattern: SNIPER_PATTERN,
            cameraRecoverRate: 10.5,
            resetAfterSeconds: 0.62,
        },
        scoped: {
            accuracy: {
                standInaccuracy: 0.001,
                moveInaccuracy: 0.034,
                airInaccuracy: 0.18,
                landingPenalty: 0.1,
                firstShotMultiplier: 0.58,
                randomSpreadMultiplier: 0.008,
                patternSpreadWeight: 0.985,
            },
            recoil: {
                basePitch: 0.0054,
                patternPitch: 0.0028,
                patternYaw: 0.0009,
                cameraRecoverRate: 12.6,
            },
        },
        movement: { speed: 200, walkSpeedMul: 0.48 },
        bot: { ...DEFAULT_BOT, burstMin: 1, burstMax: 1, shotDelay: 1.46, burstCooldownMin: 1.2, burstCooldownMax: 1.75, spreadStanding: 0.034, spreadMoving: 0.205, recoilPerShot: 0.058, recoilRecover: 0.2 },
    }),
    profile('xm1014', {
        aliases: ['xm1014', 'xm'],
        classification: 'shotgun',
        rpm: 171,
        tracerSpeed: 1200,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 20, rangeModifier: 0.7, armorRatio: 1.6, effectivePellets: 3.8 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.013,
            moveInaccuracy: 0.048,
            crouchMultiplier: 0.86,
            walkMultiplier: 0.88,
            airInaccuracy: 0.35,
            landingPenalty: 0.19,
            firstShotMultiplier: 0.22,
            recoilPerShot: 0.9,
            recoilSpreadGain: 0.0018,
            recoilMax: 10,
            recoveryRate: 5.5,
            recoveryWhileHoldingMultiplier: 0.57,
            randomSpreadMultiplier: 0.72,
            patternSpreadWeight: 0.2,
            sprayJitterExponent: 1.25,
        },
        recoil: { ...DEFAULT_RECOIL, basePitch: 0.0057, patternPitch: 0.0033, patternYaw: 0.0023, pattern: SHOTGUN_PATTERN, cameraRecoverRate: 12.0, resetAfterSeconds: 0.52 },
        movement: { speed: 215, walkSpeedMul: 0.52 },
        bot: { ...DEFAULT_BOT, burstMin: 1, burstMax: 2, shotDelay: 0.352, burstCooldownMin: 0.55, burstCooldownMax: 0.9, spreadStanding: 0.2, spreadMoving: 0.3, recoilPerShot: 0.05, recoilRecover: 0.22 },
    }),
    profile('nova', {
        aliases: ['nova'],
        classification: 'shotgun',
        rpm: 68,
        tracerSpeed: 1200,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 26, rangeModifier: 0.7, armorRatio: 1.0, effectivePellets: 3.4 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0135,
            moveInaccuracy: 0.039,
            crouchMultiplier: 0.84,
            walkMultiplier: 0.86,
            airInaccuracy: 0.34,
            landingPenalty: 0.18,
            firstShotMultiplier: 0.7,
            recoilPerShot: 0.88,
            recoilSpreadGain: 0.0022,
            recoilMax: 10,
            recoveryRate: 5.4,
            recoveryWhileHoldingMultiplier: 0.58,
            randomSpreadMultiplier: 0.94,
            patternSpreadWeight: 0.14,
            sprayJitterExponent: 1.0,
        },
        recoil: { ...DEFAULT_RECOIL, basePitch: 0.0054, patternPitch: 0.0033, patternYaw: 0.0022, pattern: SHOTGUN_PATTERN, cameraRecoverRate: 12.3, resetAfterSeconds: 0.54 },
        movement: { speed: 220, walkSpeedMul: 0.53 },
        bot: { ...DEFAULT_BOT, burstMin: 1, burstMax: 1, shotDelay: 0.882, burstCooldownMin: 0.75, burstCooldownMax: 1.1, spreadStanding: 0.178, spreadMoving: 0.278, recoilPerShot: 0.052, recoilRecover: 0.2 },
    }),
    profile('negev', {
        aliases: ['negev'],
        classification: 'machinegun',
        rpm: 800,
        tracerSpeed: 3000,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 35, rangeModifier: 0.97, armorRatio: 1.5 },
        accuracy: {
            ...DEFAULT_ACCURACY,
            standInaccuracy: 0.0072,
            moveInaccuracy: 0.036,
            crouchMultiplier: 0.76,
            walkMultiplier: 0.73,
            airInaccuracy: 0.31,
            landingPenalty: 0.16,
            firstShotMultiplier: 0.62,
            recoilPerShot: 1.18,
            recoilSpreadGain: 0.00092,
            recoilMax: 34,
            recoveryRate: 6.4,
            recoveryWhileHoldingMultiplier: 0.52,
            randomSpreadMultiplier: 0.049,
            patternSpreadWeight: 0.955,
            sprayJitterExponent: 2.25,
        },
        recoil: {
            ...DEFAULT_RECOIL,
            basePitch: 0.0042,
            patternPitch: 0.0041,
            patternYaw: 0.0038,
            movementKickScale: 0.3,
            pattern: NEGEV_PATTERN,
            cameraRecoverRate: 11.8,
            resetAfterSeconds: 0.45,
        },
        movement: { speed: 195, walkSpeedMul: 0.5 },
        bot: { ...DEFAULT_BOT, burstMin: 8, burstMax: 14, shotDelay: 0.075, burstCooldownMin: 0.3, burstCooldownMax: 0.6, spreadStanding: 0.138, spreadMoving: 0.218, recoilPerShot: 0.032, recoilRecover: 0.27 },
    }),
    profile('m9', {
        aliases: ['m9', 'knife'],
        classification: 'knife',
        rpm: 120,
        tracerSpeed: 0,
        damage: { ...DEFAULT_DAMAGE, baseDamage: 55, rangeModifier: 1.0, armorRatio: 2.0, isKnife: true },
        accuracy: { ...DEFAULT_ACCURACY, standInaccuracy: 0, moveInaccuracy: 0, airInaccuracy: 0, landingPenalty: 0, firstShotMultiplier: 1, recoilSpreadGain: 0, recoilPerShot: 0, recoilMax: 1, recoveryRate: 20, randomSpreadMultiplier: 0, patternSpreadWeight: 1, sprayJitterExponent: 2 },
        recoil: { ...DEFAULT_RECOIL, basePitch: 0, patternPitch: 0, patternYaw: 0, pattern: [{ x: 0, y: 0 }], cameraRecoverRate: 20, resetAfterSeconds: 0.2, movementKickScale: 0 },
        movement: { speed: 250, walkSpeedMul: 0.66 },
    }),
    profile('default', {
        aliases: ['default'],
        rpm: 600,
        tracerSpeed: 3200,
    }),
];

const normalizedId = (raw: string) => `${raw || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');

const PROFILE_BY_ALIAS = new Map<string, CombatProfile>();
COMBAT_PROFILES.forEach((entry) => {
    PROFILE_BY_ALIAS.set(normalizedId(entry.id), entry);
    entry.aliases.forEach((alias) => PROFILE_BY_ALIAS.set(normalizedId(alias), entry));
});

const toSeed = (value: string) => {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) || 1;
};

const randomFromSeed = (seed: number) => {
    let x = seed >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // Keep deterministic spread in [0, 1). Using bitwise "& 0xffffffff" can produce signed negatives in JS.
    return (x >>> 0) / 0x100000000;
};

export const seedFromWeapon = (weaponIdOrName: string, weaponUUID?: string) => {
    return toSeed(`${weaponIdOrName || ''}::${weaponUUID || ''}`);
};

export const resolveCombatProfile = (weaponIdOrName: string): CombatProfile => {
    const normalized = normalizedId(weaponIdOrName);
    const baseProfile = PROFILE_BY_ALIAS.get(normalized) || PROFILE_BY_ALIAS.get('default')!;
    const tune = getRuntimeWeaponTune(baseProfile.id);
    return {
        ...baseProfile,
        rpm: tune.rpm,
        tracerSpeed: tune.tracerSpeed,
        damage: {
            ...baseProfile.damage,
            baseDamage: tune.damage * tune.damageMultiplier,
        },
        accuracy: {
            ...baseProfile.accuracy,
            standInaccuracy: baseProfile.accuracy.standInaccuracy * tune.spreadMultiplier,
            moveInaccuracy: baseProfile.accuracy.moveInaccuracy * tune.spreadMultiplier,
            airInaccuracy: baseProfile.accuracy.airInaccuracy * tune.spreadMultiplier,
            landingPenalty: baseProfile.accuracy.landingPenalty * tune.spreadMultiplier,
            recoilPerShot: baseProfile.accuracy.recoilPerShot * tune.recoilMultiplier,
            recoilSpreadGain: baseProfile.accuracy.recoilSpreadGain * tune.recoilMultiplier,
            recoilMax: baseProfile.accuracy.recoilMax * Math.max(0.35, tune.recoilMultiplier),
            recoveryRate: baseProfile.accuracy.recoveryRate / Math.max(0.1, tune.recoilMultiplier),
        },
        recoil: {
            ...baseProfile.recoil,
            basePitch: baseProfile.recoil.basePitch * tune.recoilMultiplier,
            patternPitch: baseProfile.recoil.patternPitch * tune.recoilMultiplier,
            patternYaw: baseProfile.recoil.patternYaw * tune.recoilMultiplier,
            movementKickScale: baseProfile.recoil.movementKickScale * tune.recoilMultiplier,
            cameraRecoverRate: baseProfile.recoil.cameraRecoverRate / Math.max(0.1, tune.recoilMultiplier),
        },
        movement: {
            ...baseProfile.movement,
            speed: tune.speed,
        },
        bot: {
            ...baseProfile.bot,
            spreadStanding: baseProfile.bot.spreadStanding * tune.spreadMultiplier,
            spreadMoving: baseProfile.bot.spreadMoving * tune.spreadMultiplier,
            recoilPerShot: baseProfile.bot.recoilPerShot * tune.recoilMultiplier,
            recoilRecover: baseProfile.bot.recoilRecover / Math.max(0.1, tune.recoilMultiplier),
        },
    };
};

export const shotIntervalFromRpm = (rpm: number) => 60 / Math.max(1, Number(rpm) || 600);

export const toHitgroupFromPart = (part: GameObjectMaterialEnum): HitgroupName => {
    switch (part) {
        case GameObjectMaterialEnum.PlayerHead: return 'HEAD';
        case GameObjectMaterialEnum.PlayerBelly: return 'STOMACH';
        case GameObjectMaterialEnum.PlayerUpperLimb: return 'ARM';
        case GameObjectMaterialEnum.PlayerLowerLimb: return 'LEG';
        default: return 'CHEST';
    }
};

export const toHitMultiplier = (damage: CombatProfileDamage, hitgroup: HitgroupName) => {
    if (hitgroup === 'HEAD') return damage.headMultiplier;
    if (hitgroup === 'STOMACH') return damage.stomachMultiplier;
    if (hitgroup === 'LEG') return damage.legMultiplier;
    return 1.0;
};

export const computeDamageBreakdown = (
    profileOrName: CombatProfile | string,
    hitgroup: HitgroupName,
    distanceWorld: number,
    targetArmor: number,
    targetHasHelmet: boolean,
): DamageBreakdown => {
    const profile = typeof profileOrName === 'string' ? resolveCombatProfile(profileOrName) : profileOrName;
    const damageModel = profile.damage;
    const hitMultiplier = toHitMultiplier(damageModel, hitgroup);

    let rawDamage = damageModel.baseDamage * hitMultiplier;
    if (damageModel.effectivePellets && damageModel.effectivePellets > 1) rawDamage *= damageModel.effectivePellets;

    if (!damageModel.isKnife) {
        const distanceCs = Math.max(0, distanceWorld) * CSGO_UNITS_PER_WORLD;
        const dropoff = Math.pow(MathUtils.clamp(damageModel.rangeModifier, 0.45, 1.0), distanceCs / 500);
        rawDamage *= dropoff;
    }
    rawDamage = Math.max(1, rawDamage);

    const armor = Math.max(0, targetArmor);
    const armorAffects = hitgroup !== 'LEG' && (hitgroup !== 'HEAD' || targetHasHelmet);
    if (damageModel.isKnife || armor <= 0 || !armorAffects) {
        return {
            rawDamage,
            healthDamage: Math.max(1, Math.floor(rawDamage)),
            armorDamage: 0,
        };
    }

    const throughScale = MathUtils.clamp((damageModel.armorRatio || 1) * 0.5, 0.05, 1.0);
    const reducedDamage = rawDamage * throughScale;
    let armorDamage = (rawDamage - reducedDamage) * CSGO_ARMOR_BONUS_RATIO;
    let healthDamage = reducedDamage;

    if (armorDamage > armor) {
        armorDamage = armor;
        healthDamage = rawDamage - (armor / CSGO_ARMOR_BONUS_RATIO);
    }

    return {
        rawDamage,
        healthDamage: Math.max(1, Math.floor(healthDamage)),
        armorDamage: Math.max(0, Math.ceil(armorDamage)),
    };
};

const toPatternValue = (pattern: Array<{ x: number; y: number }>, index: number) => {
    if (!pattern.length) return { x: 0, y: 1 };
    if (index <= 0) return pattern[0];
    if (index >= pattern.length - 1) return pattern[pattern.length - 1];
    const base = Math.floor(index);
    const t = index - base;
    const a = pattern[base];
    const b = pattern[base + 1];
    return {
        x: MathUtils.lerp(a.x, b.x, t),
        y: MathUtils.lerp(a.y, b.y, t),
    };
};

export const computeShot = (args: {
    profileOrName: CombatProfile | string;
    movement: MovementCombatSnapshot;
    recoilIndex: number;
    recoverLine: number;
    weaponSeed: number;
    shotCounter: number;
    recoilControl: number;
    accurateRange: number;
    timeSinceLastShotSeconds: number;
    scopeInaccuracyMultiplier?: number;
    scoped?: boolean;
}): ShotComputation => {
    const profile = typeof args.profileOrName === 'string' ? resolveCombatProfile(args.profileOrName) : args.profileOrName;
    const scoped = !!args.scoped;
    const accuracy = scoped && profile.scoped?.accuracy
        ? { ...profile.accuracy, ...profile.scoped.accuracy }
        : profile.accuracy;
    const recoil = scoped && profile.scoped?.recoil
        ? { ...profile.recoil, ...profile.scoped.recoil }
        : profile.recoil;
    const movement = args.movement;
    const recoilControl = Math.max(1, args.recoilControl || 1);
    const accurateRange = Math.max(2, args.accurateRange || 2);
    const timedReset = args.timeSinceLastShotSeconds >= recoil.resetAfterSeconds;
    const effectiveRecoilIndex = timedReset ? 0 : Math.max(0, args.recoilIndex);
    const effectiveRecoverLine = timedReset ? 0 : Math.max(0, args.recoverLine);

    let inaccuracy = movement.onFloor ? accuracy.standInaccuracy : accuracy.airInaccuracy;
    const moveRatio = MathUtils.clamp(movement.speed01, 0, 1.2);
    const movePenalty = moveRatio * accuracy.moveInaccuracy * (movement.walking ? Math.max(0.42, accuracy.walkMultiplier * 0.92) : 0.82);
    inaccuracy += movePenalty;
    if (movement.crouching) {
        const crouchMul = MathUtils.clamp(accuracy.crouchMultiplier, 0.2, 1.8);
        // Keep deterministic global movement ranking for lab validation: stand < crouch < walk < run < air.
        inaccuracy *= Math.max(1, 2 - crouchMul);
    }
    if (!movement.onFloor) {
        const verticalSpeedAbs = Math.abs(Number(movement.verticalSpeed) || 0);
        const verticalPenalty = MathUtils.clamp(verticalSpeedAbs / 9.5, 0, 1.0);
        const airbornePenalty = Math.min(0.24, movement.airborneTime * 0.18);
        inaccuracy += (0.16 + (verticalPenalty * 0.28) + airbornePenalty) * accuracy.airInaccuracy;
    }
    inaccuracy += MathUtils.clamp(movement.landingImpact, 0, 1.4) * accuracy.landingPenalty;
    inaccuracy += Math.min(accuracy.recoilMax, effectiveRecoverLine) * accuracy.recoilSpreadGain;
    const scopeMul = MathUtils.clamp(args.scopeInaccuracyMultiplier ?? 1, 0.08, 1.0);
    inaccuracy *= scopeMul;

    const firstShotStable = movement.onFloor && movement.speed01 < 0.09 && effectiveRecoilIndex <= 0.15;
    if (firstShotStable) inaccuracy *= accuracy.firstShotMultiplier;
    const spreadDistanceScale = MathUtils.clamp(Math.sqrt(120 / accurateRange), 0.74, 1.45);
    const spreadBase = inaccuracy * spreadDistanceScale;
    const spreadVisualScale = 4.1;
    const spreadComputed = spreadBase * spreadVisualScale;

    const spraySeedIndex = Math.floor((effectiveRecoilIndex * 1000) + (effectiveRecoverLine * 120));
    const baseSeed = (
        args.weaponSeed
        ^ Math.imul(Math.max(1, spraySeedIndex + 1), 374761393)
        ^ Math.imul(Math.max(1, args.shotCounter + 1), 2246822519)
        ^ Math.imul(Math.max(1, Math.floor(args.accurateRange * 10)), 668265263)
    ) >>> 0;
    const r1 = randomFromSeed(baseSeed ^ 0x9e3779b9);
    const r2 = randomFromSeed(baseSeed ^ 0x85ebca6b);
    const randomSpreadMul = MathUtils.clamp(accuracy.randomSpreadMultiplier, 0, 1.2);
    const patternSpreadWeight = MathUtils.clamp(accuracy.patternSpreadWeight, 0, 1);
    const jitterExponent = MathUtils.clamp(accuracy.sprayJitterExponent, 0.7, 3.0);
    const patternPoint = toPatternValue(recoil.pattern, effectiveRecoilIndex);
    const recoilProgress = MathUtils.clamp(effectiveRecoilIndex / Math.max(1, accuracy.recoilMax), 0, 1);
    const akTune = profile.id === 'ak47' ? akRuntimeTune : DEFAULT_AK_RUNTIME_TUNE;
    const patternScaleTuning = profile.id === 'ak47' ? (1.22 * akTune.patternScaleMul) : 1;
    const patternBiasScale = spreadComputed * (
        (0.28 + (0.42 * patternSpreadWeight))
        + (recoilProgress * 0.36 * patternSpreadWeight)
    ) * patternScaleTuning;
    const patternBiasX = patternPoint.x * patternBiasScale;
    const patternBiasY = (patternPoint.y - 1) * patternBiasScale * 0.82;

    const randomAngle = r1 * Math.PI * 2;
    const randomBaseScale = Math.max(0.05, 1 - (patternSpreadWeight * 0.42));
    const phaseSpreadMul = profile.id === 'ak47'
        ? (args.shotCounter < 10 ? 0.54 : (args.shotCounter < 22 ? 0.7 : 0.86))
        : 1;
    const randomRadius = Math.pow(r2, jitterExponent) * spreadComputed * randomSpreadMul * randomBaseScale * phaseSpreadMul * akTune.randomSpreadMul;
    const randomX = Math.cos(randomAngle) * randomRadius;
    const randomY = Math.sin(randomAngle) * randomRadius;

    const spreadClamp = Math.max(0.0004, spreadComputed * 1.45);
    const spreadX = MathUtils.clamp(patternBiasX + randomX, -spreadClamp, spreadClamp);
    const spreadY = MathUtils.clamp(patternBiasY + randomY, -spreadClamp, spreadClamp);

    const movementKickMul = 1 + (MathUtils.clamp(movement.speed01, 0, 1.5) * recoil.movementKickScale) + (movement.onFloor ? 0 : 0.18);
    const controlMul = 1 / recoilControl;
    const cameraPitchKick = (recoil.basePitch + (patternPoint.y * recoil.patternPitch)) * movementKickMul * controlMul * akTune.cameraKickMul;
    const cameraYawKick = (patternPoint.x * recoil.patternYaw) * movementKickMul * controlMul * akTune.cameraKickMul;

    const recoilStep = Math.max(0.05, accuracy.recoilPerShot);
    const nextRecoilIndex = Math.min(accuracy.recoilMax, effectiveRecoilIndex + recoilStep);
    const nextRecoverLine = Math.min(accuracy.recoilMax, effectiveRecoverLine + recoilStep);

    return {
        spreadX,
        spreadY,
        cameraPitchKick,
        cameraYawKick,
        nextRecoilIndex,
        nextRecoverLine,
    };
};

export const recoverRecoil = (args: {
    profileOrName: CombatProfile | string;
    deltaTime: number;
    triggerDown: boolean;
    recoilIndex: number;
    recoverLine: number;
    pitchDebt: number;
    yawDebt: number;
}): RecoilRecoveryResult => {
    const profile = typeof args.profileOrName === 'string' ? resolveCombatProfile(args.profileOrName) : args.profileOrName;
    const accuracy = profile.accuracy;
    const recoil = profile.recoil;
    const akTune = profile.id === 'ak47' ? akRuntimeTune : DEFAULT_AK_RUNTIME_TUNE;
    const dt = Math.min(0.05, Math.max(0.001, args.deltaTime || 0.016));
    const holdingMul = args.triggerDown ? accuracy.recoveryWhileHoldingMultiplier : 1;

    const recoilDrop = accuracy.recoveryRate * dt * holdingMul * akTune.recoveryMul;
    const nextRecoilIndex = Math.max(0, args.recoilIndex - recoilDrop);
    const nextRecoverLine = Math.max(0, args.recoverLine - recoilDrop);

    const recoverAlpha = 1 - Math.exp(-(recoil.cameraRecoverRate * holdingMul * akTune.recoveryMul) * dt);
    const pitchRecover = args.pitchDebt * recoverAlpha;
    const yawRecover = args.yawDebt * recoverAlpha;

    return {
        nextRecoilIndex,
        nextRecoverLine,
        pitchRecover,
        yawRecover,
        nextPitchDebt: args.pitchDebt - pitchRecover,
        nextYawDebt: args.yawDebt - yawRecover,
    };
};

export const getBotWeaponPreset = (weaponIdOrName: string) => {
    const p = resolveCombatProfile(weaponIdOrName);
    return {
        weaponName: p.id.toUpperCase().replace(/_/g, '-'),
        rpm: p.rpm,
        shotInterval: 60 / Math.max(1, p.rpm),
        tracerSpeed: p.tracerSpeed,
        baseDamage: p.damage.baseDamage,
        armorPen: p.damage.armorRatio * 0.5,
        rangeModifier: p.damage.rangeModifier,
        burstMin: p.bot.burstMin,
        burstMax: p.bot.burstMax,
        shotDelay: p.bot.shotDelay,
        burstCooldownMin: p.bot.burstCooldownMin,
        burstCooldownMax: p.bot.burstCooldownMax,
        spreadStanding: p.bot.spreadStanding,
        spreadMoving: p.bot.spreadMoving,
        recoilPerShot: p.bot.recoilPerShot,
        recoilRecover: p.bot.recoilRecover,
    };
};
