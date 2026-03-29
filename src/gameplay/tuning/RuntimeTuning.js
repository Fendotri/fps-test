import { WEAPON_CATALOG } from '@src/gameplay/loadout/weaponCatalog';

const STORAGE_KEY = 'fps-test.runtime-tuning.v1';
const BOT_IDS = ['ct_1', 'ct_2', 't_1', 't_2', 't_3'];

const cloneState = (value) => JSON.parse(JSON.stringify(value));

const clamp = (value, min, max, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
};

const clampInt = (value, min, max, fallback) => Math.round(clamp(value, min, max, fallback));

const clampHexColor = (value, fallback) => {
    const raw = `${value || ''}`.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(raw)) return raw.startsWith('#') ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
    return fallback;
};

const buildDefaultState = () => {
    const weapons = {};
    const perBot = {};
    for (let i = 0; i < WEAPON_CATALOG.length; i++) {
        const entry = WEAPON_CATALOG[i];
        weapons[entry.weaponId] = {
            meshPreset: 'auto',
            materialTint: '#FFFFFF',
            materialBrightness: 1,
            damage: clampInt(entry.stats.damage, 1, 300, 30),
            rpm: clampInt(entry.stats.rpm, 10, 1500, 600),
            tracerSpeed: clampInt(entry.stats.tracerSpeed, 0, 10000, 3200),
            magazine: clampInt(entry.stats.magazine, 1, 200, 30),
            reserve: clampInt(entry.stats.reserve, 0, 400, 90),
            speed: clampInt(entry.stats.speed, 120, 320, 220),
            recoilControl: clamp(entry.stats.recoilControl, 1, 10, 4),
            accurateRange: clamp(entry.stats.accurateRange, 2, 1200, 120),
            recoverTime: clamp(entry.stats.recoverTime, 0.05, 6, 0.3),
            reloadTime: clamp(entry.stats.reloadTime, 0.05, 10, 2.5),
            damageMultiplier: 1,
            spreadMultiplier: 1,
            recoilMultiplier: 1,
        };
    }
    for (let i = 0; i < BOT_IDS.length; i++) {
        perBot[BOT_IDS[i]] = {
            enabled: true,
            reactionMul: 1,
            trackingMul: 1,
            aggression: 1,
            defense: 1,
            tactical: 1,
            turnSpeedMul: 1,
            hitChanceMul: 1,
        };
    }

    return {
        movement: {
            groundAccel: 62,
            airAccel: 11.5,
            friction: 8.1,
            maxGroundSpeed: 5.05,
            maxAirSpeed: 5.45,
            walkSpeedMul: 0.53,
            crouchSpeedMul: 0.34,
            jumpSpeed: 8.05,
        },
        effects: {
            tracerLifetimeMul: 1,
            tracerOpacityMul: 1,
            bodyFlashScale: 1,
            bodyParticleCountMul: 1,
            bodyParticleLifetimeMul: 1,
            bodyParticleSpeedMul: 1,
            corpseLifetimeSeconds: 3,
            corpseFadeSeconds: 0.65,
            botGlowDuration: 0.12,
            botGlowIntensity: 1,
            botGlowDecay: 5.8,
        },
        bots: {
            activeCount: BOT_IDS.length,
            turnSpeedMul: 1,
            reactionMul: 1,
            burstMul: 1,
            cooldownMul: 1,
            spreadMul: 1,
            aimLockMul: 1,
            hitChanceMul: 1,
            perBot,
        },
        weapons,
    };
};

let DEFAULT_STATE = buildDefaultState();

const normalizeWeaponTune = (weaponId, value) => {
    const fallback = DEFAULT_STATE.weapons[weaponId] || DEFAULT_STATE.weapons.ak47;
    const meshPreset = `${value?.meshPreset || fallback.meshPreset}`.toLowerCase();
    return {
        meshPreset: (meshPreset === 'ak' || meshPreset === 'usp' || meshPreset === 'm9') ? meshPreset : 'auto',
        materialTint: clampHexColor(value?.materialTint, fallback.materialTint),
        materialBrightness: clamp(value?.materialBrightness, 0.25, 3, fallback.materialBrightness),
        damage: clampInt(value?.damage, 1, 300, fallback.damage),
        rpm: clampInt(value?.rpm, 10, 1500, fallback.rpm),
        tracerSpeed: clampInt(value?.tracerSpeed, 0, 10000, fallback.tracerSpeed),
        magazine: clampInt(value?.magazine, 1, 200, fallback.magazine),
        reserve: clampInt(value?.reserve, 0, 400, fallback.reserve),
        speed: clampInt(value?.speed, 120, 320, fallback.speed),
        recoilControl: clamp(value?.recoilControl, 1, 10, fallback.recoilControl),
        accurateRange: clamp(value?.accurateRange, 2, 1200, fallback.accurateRange),
        recoverTime: clamp(value?.recoverTime, 0.05, 6, fallback.recoverTime),
        reloadTime: clamp(value?.reloadTime, 0.05, 10, fallback.reloadTime),
        damageMultiplier: clamp(value?.damageMultiplier, 0.1, 4, fallback.damageMultiplier),
        spreadMultiplier: clamp(value?.spreadMultiplier, 0.1, 4, fallback.spreadMultiplier),
        recoilMultiplier: clamp(value?.recoilMultiplier, 0.1, 4, fallback.recoilMultiplier),
    };
};

const normalizeState = (raw) => {
    const movement = raw?.movement || {};
    const effects = raw?.effects || {};
    const bots = raw?.bots || {};
    const rawWeapons = raw?.weapons || {};
    const rawPerBot = bots?.perBot || {};
    const weapons = {};
    const perBot = {};

    for (let i = 0; i < WEAPON_CATALOG.length; i++) {
        const weaponId = WEAPON_CATALOG[i].weaponId;
        weapons[weaponId] = normalizeWeaponTune(weaponId, rawWeapons[weaponId]);
    }
    for (let i = 0; i < BOT_IDS.length; i++) {
        const botId = BOT_IDS[i];
        const fallback = DEFAULT_STATE.bots.perBot[botId];
        const rawBot = rawPerBot[botId] || {};
        perBot[botId] = {
            enabled: rawBot.enabled !== false,
            reactionMul: clamp(rawBot.reactionMul, 0.15, 3, fallback.reactionMul),
            trackingMul: clamp(rawBot.trackingMul, 0.2, 2.5, fallback.trackingMul),
            aggression: clamp(rawBot.aggression, 0.2, 2.5, fallback.aggression),
            defense: clamp(rawBot.defense, 0.2, 2.5, fallback.defense),
            tactical: clamp(rawBot.tactical, 0.2, 2.5, fallback.tactical),
            turnSpeedMul: clamp(rawBot.turnSpeedMul, 0.15, 3, fallback.turnSpeedMul),
            hitChanceMul: clamp(rawBot.hitChanceMul, 0.2, 2, fallback.hitChanceMul),
        };
    }

    return {
        movement: {
            groundAccel: clamp(movement.groundAccel, 1, 140, 62),
            airAccel: clamp(movement.airAccel, 0.1, 60, 11.5),
            friction: clamp(movement.friction, 0.1, 40, 8.1),
            maxGroundSpeed: clamp(movement.maxGroundSpeed, 1, 20, 5.05),
            maxAirSpeed: clamp(movement.maxAirSpeed, 1, 20, 5.45),
            walkSpeedMul: clamp(movement.walkSpeedMul, 0.1, 1.4, 0.53),
            crouchSpeedMul: clamp(movement.crouchSpeedMul, 0.1, 1.2, 0.34),
            jumpSpeed: clamp(movement.jumpSpeed, 1, 20, 8.05),
        },
        effects: {
            tracerLifetimeMul: clamp(effects.tracerLifetimeMul, 0.1, 4, 1),
            tracerOpacityMul: clamp(effects.tracerOpacityMul, 0.05, 3, 1),
            bodyFlashScale: clamp(effects.bodyFlashScale, 0.1, 4, 1),
            bodyParticleCountMul: clamp(effects.bodyParticleCountMul, 0.1, 4, 1),
            bodyParticleLifetimeMul: clamp(effects.bodyParticleLifetimeMul, 0.1, 4, 1),
            bodyParticleSpeedMul: clamp(effects.bodyParticleSpeedMul, 0.1, 4, 1),
            corpseLifetimeSeconds: clamp(effects.corpseLifetimeSeconds, 0.5, 30, 3),
            corpseFadeSeconds: clamp(effects.corpseFadeSeconds, 0.1, 10, 0.65),
            botGlowDuration: clamp(effects.botGlowDuration, 0.02, 2, 0.12),
            botGlowIntensity: clamp(effects.botGlowIntensity, 0.1, 4, 1),
            botGlowDecay: clamp(effects.botGlowDecay, 0.1, 20, 5.8),
        },
        bots: {
            activeCount: clamp(Math.round(bots.activeCount), 0, BOT_IDS.length, BOT_IDS.length),
            turnSpeedMul: clamp(bots.turnSpeedMul, 0.15, 3, 1),
            reactionMul: clamp(bots.reactionMul, 0.15, 3, 1),
            burstMul: clamp(bots.burstMul, 0.2, 3, 1),
            cooldownMul: clamp(bots.cooldownMul, 0.2, 3, 1),
            spreadMul: clamp(bots.spreadMul, 0.2, 3, 1),
            aimLockMul: clamp(bots.aimLockMul, 0.2, 2, 1),
            hitChanceMul: clamp(bots.hitChanceMul, 0.2, 2, 1),
            perBot,
        },
        weapons,
    };
};

const loadSavedState = () => {
    if (typeof window === 'undefined' || !window.localStorage) return cloneState(DEFAULT_STATE);
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return cloneState(DEFAULT_STATE);
        return normalizeState(JSON.parse(raw));
    } catch {
        return cloneState(DEFAULT_STATE);
    }
};

let savedState = loadSavedState();
let draftState = cloneState(savedState);
const listeners = new Set();

const emit = () => {
    const snapshot = cloneState(draftState);
    listeners.forEach((listener) => listener(snapshot));
};

export const getRuntimeTuningDefaults = () => cloneState(DEFAULT_STATE);
export const getRuntimeTuningSaved = () => cloneState(savedState);
export const getRuntimeTuningSnapshot = () => cloneState(draftState);
export const getRuntimeWeaponTune = (weaponId) => {
    const safeId = `${weaponId || ''}`.trim().toLowerCase();
    return cloneState(draftState.weapons[safeId] || DEFAULT_STATE.weapons.ak47);
};
export const getRuntimeBotTune = (botId) => {
    const safeId = `${botId || ''}`.trim().toLowerCase();
    return cloneState(draftState.bots.perBot[safeId] || DEFAULT_STATE.bots.perBot.ct_1);
};
export const getRuntimeBotIds = () => [...BOT_IDS];
export const syncRuntimeTuningCatalog = () => {
    DEFAULT_STATE = buildDefaultState();
    savedState = normalizeState(savedState);
    draftState = normalizeState(draftState);
    emit();
    return getRuntimeTuningSnapshot();
};

export const updateRuntimeTuning = (mutator) => {
    const next = cloneState(draftState);
    mutator(next);
    draftState = normalizeState(next);
    emit();
    return getRuntimeTuningSnapshot();
};

export const applyRemoteRuntimeTuning = (partial) => {
    const next = cloneState(draftState);
    if (partial?.movement) next.movement = { ...next.movement, ...partial.movement };
    if (partial?.effects) next.effects = { ...next.effects, ...partial.effects };
    if (partial?.bots) next.bots = {
        ...next.bots,
        ...partial.bots,
        perBot: {
            ...next.bots.perBot,
            ...(partial.bots.perBot || {}),
        },
    };
    if (partial?.weapons) next.weapons = {
        ...next.weapons,
        ...partial.weapons,
    };
    draftState = normalizeState(next);
    emit();
    return getRuntimeTuningSnapshot();
};

export const saveRuntimeTuning = () => {
    savedState = normalizeState(draftState);
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    }
    emit();
    return getRuntimeTuningSaved();
};

export const revertRuntimeTuningDraft = () => {
    draftState = cloneState(savedState);
    emit();
    return getRuntimeTuningSnapshot();
};

export const resetRuntimeTuningDraft = () => {
    draftState = cloneState(DEFAULT_STATE);
    emit();
    return getRuntimeTuningSnapshot();
};

export const subscribeRuntimeTuning = (listener) => {
    listeners.add(listener);
    listener(getRuntimeTuningSnapshot());
    return () => listeners.delete(listener);
};
