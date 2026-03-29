import { WeaponClassificationEnum } from '@src/gameplay/abstract/WeaponClassificationEnum';

export type LoadoutSlot = 'primary' | 'secondary' | 'knife';

export type LoadoutProfile = {
    primary: string;
    secondary: string;
    knife: string;
};

type WeaponStats = {
    damage: number;
    fireRate: number;
    rpm?: number;
    tracerSpeed?: number;
    magazine: number;
    reserve: number;
    speed: number;
    recoilControl: number;
    deployTime?: number;
    recoverTime: number;
    reloadTime: number;
    accurateRange: number;
    classification: WeaponClassificationEnum;
    damageModel?: {
        baseDamage: number;
        rangeModifier: number;
        armorRatio: number;
        headMultiplier: number;
        stomachMultiplier: number;
        legMultiplier: number;
        effectivePellets?: number;
        isKnife?: boolean;
    };
    inaccuracyModel?: {
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
    };
    recoilModel?: {
        basePitch: number;
        patternPitch: number;
        patternYaw: number;
        movementKickScale: number;
        cameraRecoverRate: number;
        resetAfterSeconds: number;
    };
    movementModel?: {
        speed: number;
        walkSpeedMul: number;
        crouchSpeedMul?: number;
    };
};

export type WeaponCatalogEntry = {
    weaponId: string;
    displayName: string;
    description?: string;
    category?: string;
    priceCoin?: number;
    rarity?: string;
    dropWeight?: number;
    iconPath?: string;
    modelPath?: string;
    modelPosition?: [number, number, number];
    modelRotation?: [number, number, number];
    modelScale?: [number, number, number];
    enabled?: boolean;
    slot: LoadoutSlot;
    placeholderRig: 'ak' | 'usp' | 'm9';
    stats: WeaponStats;
};

const toKey = (value: any) => `${value || ''}`.trim().toLowerCase();

const makeStats = (raw: WeaponStats): WeaponStats => ({
    ...raw,
    rpm: Number(raw.rpm) > 0 ? Number(raw.rpm) : Math.round(60 / Math.max(0.01, Number(raw.fireRate) || 0.1)),
    tracerSpeed: Math.max(100, Number(raw.tracerSpeed) || 3200),
    damageModel: raw.damageModel || {
        baseDamage: raw.damage,
        rangeModifier: 0.96,
        armorRatio: 1.3,
        headMultiplier: 4.0,
        stomachMultiplier: 1.25,
        legMultiplier: 0.75,
    },
    inaccuracyModel: raw.inaccuracyModel || {
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
    },
    recoilModel: raw.recoilModel || {
        basePitch: 0.0048,
        patternPitch: 0.0038,
        patternYaw: 0.0042,
        movementKickScale: 0.22,
        cameraRecoverRate: 16.5,
        resetAfterSeconds: 0.42,
    },
    movementModel: raw.movementModel || {
        speed: raw.speed,
        walkSpeedMul: 0.53,
        crouchSpeedMul: 0.34,
    },
});

export const DEFAULT_FFA_LOADOUT: LoadoutProfile = {
    primary: 'ak47',
    secondary: 'usp_s',
    knife: 'm9',
};

export const BASE_WEAPON_CATALOG: WeaponCatalogEntry[] = [
    {
        weaponId: 'glock18',
        displayName: 'Glock-18',
        slot: 'secondary',
        placeholderRig: 'usp',
        stats: makeStats({ damage: 30, fireRate: 60 / 400, rpm: 400, tracerSpeed: 2000, magazine: 20, reserve: 120, speed: 240, recoilControl: 5, recoverTime: 0.25, reloadTime: 2.2, accurateRange: 110, classification: WeaponClassificationEnum.Pistol }),
    },
    {
        weaponId: 'usp_s',
        displayName: 'USP-S',
        slot: 'secondary',
        placeholderRig: 'usp',
        stats: makeStats({ damage: 35, fireRate: 60 / 352, rpm: 352, tracerSpeed: 2100, magazine: 12, reserve: 24, speed: 240, recoilControl: 5, recoverTime: 0.34, reloadTime: 2.17, accurateRange: 120, classification: WeaponClassificationEnum.Pistol }),
    },
    {
        weaponId: 'deagle',
        displayName: 'Desert Eagle',
        slot: 'secondary',
        placeholderRig: 'usp',
        stats: makeStats({ damage: 53, fireRate: 60 / 267, rpm: 267, tracerSpeed: 2300, magazine: 7, reserve: 35, speed: 230, recoilControl: 3, recoverTime: 0.4, reloadTime: 2.2, accurateRange: 150, classification: WeaponClassificationEnum.Pistol }),
    },
    {
        weaponId: 'mac10',
        displayName: 'MAC-10',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 29, fireRate: 60 / 800, rpm: 800, tracerSpeed: 2450, magazine: 30, reserve: 100, speed: 240, recoilControl: 5, recoverTime: 0.26, reloadTime: 2.6, accurateRange: 105, classification: WeaponClassificationEnum.SMG }),
    },
    {
        weaponId: 'mp9',
        displayName: 'MP9',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 26, fireRate: 60 / 857, rpm: 857, tracerSpeed: 2500, magazine: 30, reserve: 120, speed: 240, recoilControl: 5, recoverTime: 0.28, reloadTime: 2.1, accurateRange: 110, classification: WeaponClassificationEnum.SMG }),
    },
    {
        weaponId: 'p90',
        displayName: 'P90',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 26, fireRate: 60 / 857, rpm: 857, tracerSpeed: 2600, magazine: 50, reserve: 100, speed: 230, recoilControl: 5, recoverTime: 0.3, reloadTime: 3.4, accurateRange: 120, classification: WeaponClassificationEnum.SMG }),
    },
    {
        weaponId: 'ak47',
        displayName: 'AK-47',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({
            damage: 36,
            fireRate: 60 / 600,
            rpm: 600,
            tracerSpeed: 715,
            magazine: 30,
            reserve: 90,
            speed: 215,
            recoilControl: 4,
            deployTime: 1.10,
            recoverTime: 1.10,
            reloadTime: 2.43,
            accurateRange: 120,
            classification: WeaponClassificationEnum.Rifle,
            damageModel: {
                baseDamage: 36,
                rangeModifier: 0.98,
                armorRatio: 1.55,
                headMultiplier: 4.0,
                stomachMultiplier: 1.25,
                legMultiplier: 0.75,
            },
            inaccuracyModel: {
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
            },
            recoilModel: {
                basePitch: 0.00375,
                patternPitch: 0.00295,
                patternYaw: 0.00195,
                movementKickScale: 0.22,
                cameraRecoverRate: 15.2,
                resetAfterSeconds: 0.41,
            },
            movementModel: {
                speed: 215,
                walkSpeedMul: 0.521,
                crouchSpeedMul: 0.339,
            },
        }),
    },
    {
        weaponId: 'm4a1_s',
        displayName: 'M4A1-S',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 38, fireRate: 60 / 600, rpm: 600, tracerSpeed: 3500, magazine: 25, reserve: 75, speed: 225, recoilControl: 4, recoverTime: 0.34, reloadTime: 3.1, accurateRange: 122, classification: WeaponClassificationEnum.Rifle }),
    },
    {
        weaponId: 'sg553',
        displayName: 'SG 553',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 30, fireRate: 60 / 545, rpm: 545, tracerSpeed: 3600, magazine: 30, reserve: 90, speed: 210, recoilControl: 4, recoverTime: 0.34, reloadTime: 2.8, accurateRange: 132, classification: WeaponClassificationEnum.Rifle }),
    },
    {
        weaponId: 'aug',
        displayName: 'AUG',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 28, fireRate: 60 / 600, rpm: 600, tracerSpeed: 3600, magazine: 30, reserve: 90, speed: 220, recoilControl: 4, recoverTime: 0.34, reloadTime: 3.8, accurateRange: 128, classification: WeaponClassificationEnum.Rifle }),
    },
    {
        weaponId: 'awp',
        displayName: 'AWP',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 115, fireRate: 60 / 41, rpm: 41, tracerSpeed: 4500, magazine: 10, reserve: 30, speed: 200, recoilControl: 2, recoverTime: 1.0, reloadTime: 3.67, accurateRange: 520, classification: WeaponClassificationEnum.SniperRifle }),
    },
    {
        weaponId: 'xm1014',
        displayName: 'XM1014',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 20, fireRate: 60 / 171, rpm: 171, tracerSpeed: 1200, magazine: 7, reserve: 32, speed: 215, recoilControl: 3, recoverTime: 0.6, reloadTime: 3.0, accurateRange: 52, classification: WeaponClassificationEnum.Shotgun }),
    },
    {
        weaponId: 'negev',
        displayName: 'Negev',
        slot: 'primary',
        placeholderRig: 'ak',
        stats: makeStats({ damage: 35, fireRate: 60 / 800, rpm: 800, tracerSpeed: 3000, magazine: 150, reserve: 200, speed: 195, recoilControl: 3, recoverTime: 0.48, reloadTime: 5.7, accurateRange: 150, classification: WeaponClassificationEnum.Machinegun }),
    },
    {
        weaponId: 'm9',
        displayName: 'M9 Knife',
        slot: 'knife',
        placeholderRig: 'm9',
        stats: makeStats({ damage: 55, fireRate: 0.5, rpm: 120, tracerSpeed: 0, magazine: 1, reserve: 0, speed: 250, recoilControl: 1, recoverTime: 0.1, reloadTime: 0.1, accurateRange: 2, classification: WeaponClassificationEnum.Malee }),
    },
];

export const WEAPON_CATALOG: WeaponCatalogEntry[] = BASE_WEAPON_CATALOG.map((item) => ({
    ...item,
    enabled: item.enabled !== false,
}));

const CATALOG_BY_ID = new Map<string, WeaponCatalogEntry>();

const rebuildCatalogIndex = () => {
    CATALOG_BY_ID.clear();
    WEAPON_CATALOG.forEach((item) => {
        CATALOG_BY_ID.set(toKey(item.weaponId), item);
    });
};

rebuildCatalogIndex();

export const replaceWeaponCatalog = (entries: WeaponCatalogEntry[]) => {
    WEAPON_CATALOG.splice(0, WEAPON_CATALOG.length, ...entries.map((item) => ({
        ...item,
        enabled: item.enabled !== false,
        stats: makeStats(item.stats),
    })));
    rebuildCatalogIndex();
    return WEAPON_CATALOG;
};

export const getWeaponEntry = (weaponId: string) => CATALOG_BY_ID.get(toKey(weaponId));

const pickForSlot = (slot: LoadoutSlot, preferredId: string, fallbackId: string) => {
    const preferred = getWeaponEntry(preferredId);
    if (preferred && preferred.slot === slot) return preferred.weaponId;
    const fallback = getWeaponEntry(fallbackId);
    if (fallback && fallback.slot === slot) return fallback.weaponId;
    const first = WEAPON_CATALOG.find((item) => item.slot === slot);
    return first ? first.weaponId : fallbackId;
};

export const normalizeLoadoutProfile = (raw: Partial<LoadoutProfile> | null | undefined): LoadoutProfile => {
    return {
        primary: pickForSlot('primary', `${raw?.primary || ''}`, DEFAULT_FFA_LOADOUT.primary),
        secondary: pickForSlot('secondary', `${raw?.secondary || ''}`, DEFAULT_FFA_LOADOUT.secondary),
        knife: pickForSlot('knife', `${raw?.knife || ''}`, DEFAULT_FFA_LOADOUT.knife),
    };
};
