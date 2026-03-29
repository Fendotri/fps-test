import { BASE_WEAPON_CATALOG, DEFAULT_FFA_LOADOUT, replaceWeaponCatalog } from '@src/gameplay/loadout/weaponCatalog';
import { syncRuntimeTuningCatalog } from '@src/gameplay/tuning/RuntimeTuning';
import { backendApi } from '@src/services/BackendApi';

const STORAGE_KEY = 'fps-test.content-studio.v1';
const ADMIN_KEY_STORAGE_KEY = 'fps-test.content-studio.admin-key';

const clone = (value) => JSON.parse(JSON.stringify(value));
const toKey = (value) => `${value || ''}`.trim().toLowerCase();
const toTitle = (value) => `${value || ''}`
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
const clamp = (value, min, max, fallback) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
};
const clampInt = (value, min, max, fallback) => Math.round(clamp(value, min, max, fallback));
const normalizeVec3 = (value, fallback) => {
    const source = Array.isArray(value) ? value : fallback;
    const safe = Array.isArray(source) ? source : [0, 0, 0];
    return [0, 1, 2].map((index) => {
        const numeric = Number(safe[index]);
        return Number.isFinite(numeric) ? numeric : Number(fallback?.[index] || 0);
    });
};
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result || ''}`);
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
});

const DEFAULT_CASES = [
    {
        id: 'falcon_case',
        title: 'Falcon Case',
        description: 'Balanced rifle and pistol pool.',
        offerId: 'case_falcon',
        openPriceCoin: 180,
        priceCoin: 180,
        enabled: true,
        drops: [
            { skin: 'Forest Camo AK', rarity: 'milspec', weaponId: 'ak47', weight: 24 },
            { skin: 'Crimson USP', rarity: 'milspec', weaponId: 'usp_s', weight: 24 },
            { skin: 'Ice Nova', rarity: 'milspec', weaponId: 'xm1014', weight: 18 },
            { skin: 'Carbon AWP', rarity: 'restricted', weaponId: 'awp', weight: 12 },
            { skin: 'Neon MP9', rarity: 'restricted', weaponId: 'mp9', weight: 12 },
            { skin: 'Night M9', rarity: 'classified', weaponId: 'm9', weight: 6 },
            { skin: 'Bronze Mirage Gloves', rarity: 'covert', weight: 4 },
        ],
    },
    {
        id: 'mirage_case',
        title: 'Mirage Case',
        description: 'Higher-tier drop pool with rarer finishes.',
        offerId: 'case_mirage',
        openPriceCoin: 320,
        priceCoin: 320,
        enabled: true,
        drops: [
            { skin: 'Obsidian AK', rarity: 'restricted', weaponId: 'ak47', weight: 18 },
            { skin: 'Ruby USP', rarity: 'restricted', weaponId: 'usp_s', weight: 18 },
            { skin: 'Azure Nova', rarity: 'restricted', weaponId: 'xm1014', weight: 14 },
            { skin: 'Gold Carbon AWP', rarity: 'classified', weaponId: 'awp', weight: 10 },
            { skin: 'Arctic MP9', rarity: 'classified', weaponId: 'mp9', weight: 10 },
            { skin: 'Ivory M9', rarity: 'covert', weaponId: 'm9', weight: 6 },
            { skin: 'Diamond Mirage Gloves', rarity: 'contraband', weight: 2 },
        ],
    },
];

const DEFAULT_PACKS = [
    {
        id: 'rifle_core_pack',
        title: 'Rifle Core Pack',
        description: 'Main rifle bundle for testing store content.',
        priceCoin: 6900,
        enabled: true,
        weaponIds: ['ak47', 'm4a1_s', 'sg553', 'aug', 'awp'],
    },
];

const DEFAULT_PLACEHOLDERS = {
    players: [
        {
            id: 'default_ct_operator',
            title: 'CT Operator',
            description: 'Reserved entity slot for future player content editing.',
            enabled: true,
        },
    ],
    maps: [
        {
            id: 'mirage_map',
            title: 'Mirage',
            description: 'Reserved entity slot for future map content editing.',
            enabled: true,
        },
    ],
};

const buildDefaultWeapons = () => BASE_WEAPON_CATALOG.map((entry) => ({
    weaponId: entry.weaponId,
    displayName: entry.displayName,
    description: entry.description || `${entry.displayName} gameplay profile.`,
    category: entry.category || toTitle(entry.stats.classification),
    priceCoin: entry.priceCoin || 0,
    rarity: entry.rarity || 'milspec',
    dropWeight: Number.isFinite(Number(entry.dropWeight)) ? Number(entry.dropWeight) : 10,
    iconPath: entry.iconPath || '',
    modelPath: entry.modelPath || '',
    modelPosition: Array.isArray(entry.modelPosition) ? clone(entry.modelPosition) : [0.02, 0.98, 0.44],
    modelRotation: Array.isArray(entry.modelRotation) ? clone(entry.modelRotation) : [0, 180, 0],
    modelScale: Array.isArray(entry.modelScale) ? clone(entry.modelScale) : [1, 1, 1],
    enabled: entry.enabled !== false,
    slot: entry.slot,
    placeholderRig: entry.placeholderRig,
    stats: clone(entry.stats),
}));

const buildDefaultState = () => ({
    schemaVersion: 1,
    defaultLoadout: clone(DEFAULT_FFA_LOADOUT),
    weapons: buildDefaultWeapons(),
    cases: clone(DEFAULT_CASES),
    packs: clone(DEFAULT_PACKS),
    players: clone(DEFAULT_PLACEHOLDERS.players),
    maps: clone(DEFAULT_PLACEHOLDERS.maps),
});

const makeFallbackWeapon = (weaponId) => {
    const normalized = toKey(weaponId);
    return {
        weaponId: normalized || `weapon_${Math.random().toString(36).slice(2, 7)}`,
        displayName: normalized ? toTitle(normalized) : 'New Weapon',
        description: 'Custom weapon profile.',
        category: 'Custom',
        priceCoin: 1200,
        rarity: 'milspec',
        dropWeight: 10,
        iconPath: '',
        modelPath: '',
        modelPosition: [0.02, 0.98, 0.44],
        modelRotation: [0, 180, 0],
        modelScale: [1, 1, 1],
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: clone(BASE_WEAPON_CATALOG[0].stats),
    };
};

const normalizeWeapon = (weapon, fallbackWeaponId = '') => {
    const fallback = BASE_WEAPON_CATALOG.find((item) => item.weaponId === toKey(fallbackWeaponId))
        || BASE_WEAPON_CATALOG.find((item) => item.weaponId === toKey(weapon?.weaponId))
        || BASE_WEAPON_CATALOG[0];
    const seed = makeFallbackWeapon(fallbackWeaponId || fallback?.weaponId || 'ak47');
    const weaponId = toKey(weapon?.weaponId || fallbackWeaponId || seed.weaponId) || seed.weaponId;
    const stats = weapon?.stats || {};
    return {
        weaponId,
        displayName: `${weapon?.displayName || fallback?.displayName || seed.displayName}`.trim() || seed.displayName,
        description: `${weapon?.description || fallback?.description || seed.description}`.trim(),
        category: `${weapon?.category || fallback?.category || seed.category}`.trim(),
        priceCoin: clampInt(weapon?.priceCoin, 0, 20000, fallback?.priceCoin || seed.priceCoin),
        rarity: `${weapon?.rarity || fallback?.rarity || seed.rarity}`.trim() || seed.rarity,
        dropWeight: clamp(weapon?.dropWeight, 0, 1000, fallback?.dropWeight || seed.dropWeight),
        iconPath: `${weapon?.iconPath || fallback?.iconPath || ''}`.trim(),
        modelPath: `${weapon?.modelPath || fallback?.modelPath || ''}`.trim(),
        modelPosition: normalizeVec3(weapon?.modelPosition, fallback?.modelPosition || seed.modelPosition),
        modelRotation: normalizeVec3(weapon?.modelRotation, fallback?.modelRotation || seed.modelRotation),
        modelScale: normalizeVec3(weapon?.modelScale, fallback?.modelScale || seed.modelScale),
        enabled: weapon?.enabled !== false,
        slot: ['primary', 'secondary', 'knife'].includes(`${weapon?.slot || fallback?.slot || seed.slot}`) ? `${weapon?.slot || fallback?.slot || seed.slot}` : seed.slot,
        placeholderRig: ['ak', 'usp', 'm9'].includes(`${weapon?.placeholderRig || fallback?.placeholderRig || seed.placeholderRig}`) ? `${weapon?.placeholderRig || fallback?.placeholderRig || seed.placeholderRig}` : seed.placeholderRig,
        stats: {
            ...clone(fallback?.stats || seed.stats),
            ...clone(stats),
            damage: clampInt(stats.damage ?? weapon?.stats?.damage, 1, 300, fallback?.stats?.damage || seed.stats.damage),
            fireRate: clamp(stats.fireRate ?? weapon?.stats?.fireRate, 0.04, 4, fallback?.stats?.fireRate || seed.stats.fireRate),
            rpm: clampInt(stats.rpm ?? weapon?.stats?.rpm, 10, 1500, fallback?.stats?.rpm || seed.stats.rpm || 600),
            tracerSpeed: clampInt(stats.tracerSpeed ?? weapon?.stats?.tracerSpeed, 0, 10000, fallback?.stats?.tracerSpeed || seed.stats.tracerSpeed || 3200),
            magazine: clampInt(stats.magazine ?? weapon?.stats?.magazine, 1, 300, fallback?.stats?.magazine || seed.stats.magazine),
            reserve: clampInt(stats.reserve ?? weapon?.stats?.reserve, 0, 999, fallback?.stats?.reserve || seed.stats.reserve),
            speed: clampInt(stats.speed ?? weapon?.stats?.speed, 120, 320, fallback?.stats?.speed || seed.stats.speed),
            recoilControl: clamp(stats.recoilControl ?? weapon?.stats?.recoilControl, 1, 10, fallback?.stats?.recoilControl || seed.stats.recoilControl),
            deployTime: clamp(stats.deployTime ?? weapon?.stats?.deployTime, 0.05, 8, fallback?.stats?.deployTime || seed.stats.deployTime || 0.25),
            recoverTime: clamp(stats.recoverTime ?? weapon?.stats?.recoverTime, 0.05, 8, fallback?.stats?.recoverTime || seed.stats.recoverTime),
            reloadTime: clamp(stats.reloadTime ?? weapon?.stats?.reloadTime, 0.05, 10, fallback?.stats?.reloadTime || seed.stats.reloadTime),
            accurateRange: clampInt(stats.accurateRange ?? weapon?.stats?.accurateRange, 2, 1500, fallback?.stats?.accurateRange || seed.stats.accurateRange),
            classification: `${stats.classification || fallback?.stats?.classification || seed.stats.classification}`,
            damageModel: clone(stats.damageModel || fallback?.stats?.damageModel || seed.stats.damageModel),
            inaccuracyModel: clone(stats.inaccuracyModel || fallback?.stats?.inaccuracyModel || seed.stats.inaccuracyModel),
            recoilModel: clone(stats.recoilModel || fallback?.stats?.recoilModel || seed.stats.recoilModel),
            movementModel: clone(stats.movementModel || fallback?.stats?.movementModel || seed.stats.movementModel),
        },
    };
};

const normalizeCase = (caseItem, index) => {
    const safeId = toKey(caseItem?.id) || `case_${index + 1}`;
    const drops = Array.isArray(caseItem?.drops) ? caseItem.drops : [];
    return {
        id: safeId,
        title: `${caseItem?.title || toTitle(safeId)}`.trim(),
        description: `${caseItem?.description || ''}`.trim(),
        offerId: toKey(caseItem?.offerId) || `offer_${safeId}`,
        openPriceCoin: clampInt(caseItem?.openPriceCoin, 0, 20000, 180),
        priceCoin: clampInt(caseItem?.priceCoin, 0, 20000, caseItem?.openPriceCoin || 180),
        enabled: caseItem?.enabled !== false,
        drops: drops.map((drop, dropIndex) => ({
            skin: `${drop?.skin || `Drop ${dropIndex + 1}`}`.trim(),
            rarity: `${drop?.rarity || 'milspec'}`.trim(),
            slot: `${drop?.slot || ''}`.trim(),
            weaponId: toKey(drop?.weaponId),
            weight: clamp(drop?.weight, 0, 1000, 10),
            chance: clamp(drop?.chance, 0, 100, 0),
        })),
    };
};

const normalizePack = (pack, index) => {
    const safeId = toKey(pack?.id) || `pack_${index + 1}`;
    return {
        id: safeId,
        title: `${pack?.title || toTitle(safeId)}`.trim(),
        description: `${pack?.description || ''}`.trim(),
        priceCoin: clampInt(pack?.priceCoin, 0, 50000, 0),
        enabled: pack?.enabled !== false,
        weaponIds: Array.isArray(pack?.weaponIds) ? pack.weaponIds.map((item) => toKey(item)).filter(Boolean) : [],
    };
};

const normalizePlaceholderEntity = (entity, index, prefix) => ({
    id: toKey(entity?.id) || `${prefix}_${index + 1}`,
    title: `${entity?.title || toTitle(entity?.id || `${prefix} ${index + 1}`)}`.trim(),
    description: `${entity?.description || ''}`.trim(),
    enabled: entity?.enabled !== false,
});

const normalizeVariantPreset = (preset, index) => ({
    id: toKey(preset?.id) || `variant_${index + 1}`,
    title: `${preset?.title || toTitle(preset?.id || `variant ${index + 1}`)}`.trim(),
    visibleMeshes: Array.isArray(preset?.visibleMeshes) ? preset.visibleMeshes.map((item) => `${item || ''}`.trim()).filter(Boolean) : [],
});

const normalizePlayerEntity = (entity, index) => {
    const base = normalizePlaceholderEntity(entity, index, 'player');
    const meshVisibility = entity?.meshVisibility && typeof entity.meshVisibility === 'object' ? entity.meshVisibility : {};
    const normalizedVisibility = {};
    Object.keys(meshVisibility).forEach((key) => {
        const safeKey = `${key || ''}`.trim();
        if (!safeKey) return;
        normalizedVisibility[safeKey] = meshVisibility[key] !== false;
    });
    return {
        ...base,
        iconPath: `${entity?.iconPath || ''}`.trim(),
        modelPath: `${entity?.modelPath || ''}`.trim(),
        animationPath: `${entity?.animationPath || ''}`.trim(),
        modelPosition: normalizeVec3(entity?.modelPosition, [0, 0, 0]),
        modelRotation: normalizeVec3(entity?.modelRotation, [0, 180, 0]),
        modelScale: normalizeVec3(entity?.modelScale, [1, 1, 1]),
        meshVisibility: normalizedVisibility,
        variantPresets: Array.isArray(entity?.variantPresets) ? entity.variantPresets.map(normalizeVariantPreset) : [],
        activeVariantId: toKey(entity?.activeVariantId || ''),
    };
};

const normalizeState = (raw) => {
    const defaults = buildDefaultState();
    const seenWeaponIds = new Set();
    const weapons = (Array.isArray(raw?.weapons) ? raw.weapons : defaults.weapons)
        .map((weapon, index) => normalizeWeapon(weapon, defaults.weapons[index]?.weaponId || 'ak47'))
        .filter((weapon) => {
            if (!weapon.weaponId || seenWeaponIds.has(weapon.weaponId)) return false;
            seenWeaponIds.add(weapon.weaponId);
            return true;
        });

    const cases = (Array.isArray(raw?.cases) ? raw.cases : defaults.cases).map(normalizeCase);
    const packs = (Array.isArray(raw?.packs) ? raw.packs : defaults.packs).map(normalizePack);
    const players = (Array.isArray(raw?.players) ? raw.players : defaults.players).map((item, index) => normalizePlayerEntity(item, index));
    const maps = (Array.isArray(raw?.maps) ? raw.maps : defaults.maps).map((item, index) => normalizePlaceholderEntity(item, index, 'map'));

    const defaultLoadout = {
        primary: toKey(raw?.defaultLoadout?.primary) || DEFAULT_FFA_LOADOUT.primary,
        secondary: toKey(raw?.defaultLoadout?.secondary) || DEFAULT_FFA_LOADOUT.secondary,
        knife: toKey(raw?.defaultLoadout?.knife) || DEFAULT_FFA_LOADOUT.knife,
    };

    return {
        schemaVersion: 1,
        defaultLoadout,
        weapons,
        cases,
        packs,
        players,
        maps,
    };
};

const createGameplayCatalog = (state) => state.weapons
    .filter((weapon) => weapon.enabled !== false)
    .map((weapon) => ({
        weaponId: weapon.weaponId,
        displayName: weapon.displayName,
        description: weapon.description,
        category: weapon.category,
        priceCoin: weapon.priceCoin,
        rarity: weapon.rarity,
        dropWeight: weapon.dropWeight,
        iconPath: weapon.iconPath,
        modelPath: weapon.modelPath,
        modelPosition: clone(weapon.modelPosition),
        modelRotation: clone(weapon.modelRotation),
        modelScale: clone(weapon.modelScale),
        enabled: weapon.enabled !== false,
        slot: weapon.slot,
        placeholderRig: weapon.placeholderRig,
        stats: clone(weapon.stats),
    }));

const createLiveopsPayload = (state, previousLiveops = null) => {
    const base = previousLiveops && typeof previousLiveops === 'object' ? clone(previousLiveops) : {};
    const cases = {};
    state.cases.forEach((item) => {
        cases[item.id] = {
            id: item.id,
            title: item.title,
            description: item.description,
            offerId: item.offerId,
            openPriceCoin: item.openPriceCoin,
            priceCoin: item.priceCoin,
            enabled: item.enabled !== false,
            drops: clone(item.drops),
        };
    });

    const offers = [
        ...state.cases
            .filter((item) => item.enabled !== false)
            .map((item) => ({
                id: item.offerId,
                title: item.title,
                type: 'case',
                caseId: item.id,
                priceCoin: item.priceCoin,
                description: item.description,
            })),
        ...state.packs
            .filter((item) => item.enabled !== false)
            .map((item) => ({
                id: item.id,
                title: item.title,
                type: 'bundle',
                bundleSize: Math.max(1, item.weaponIds.length || 1),
                priceCoin: item.priceCoin,
                description: item.description,
            })),
    ];

    return {
        ...base,
        weaponsCatalog: createGameplayCatalog(state),
        defaultLoadout: clone(state.defaultLoadout),
        cases,
        storefront: {
            ...(base.storefront || {}),
            offers,
        },
        contentStudio: {
            packs: clone(state.packs),
            players: clone(state.players),
            maps: clone(state.maps),
        },
    };
};

const createStateFromLiveops = (liveops) => normalizeState({
    defaultLoadout: liveops?.defaultLoadout,
    weapons: Array.isArray(liveops?.weaponsCatalog) ? liveops.weaponsCatalog : [],
    cases: Object.values(liveops?.cases || {}),
    packs: liveops?.contentStudio?.packs,
    players: liveops?.contentStudio?.players,
    maps: liveops?.contentStudio?.maps,
});

const applyCatalogSync = (state) => {
    replaceWeaponCatalog(createGameplayCatalog(state));
    syncRuntimeTuningCatalog();
};

const loadSavedState = () => {
    if (typeof window === 'undefined' || !window.localStorage) return normalizeState(buildDefaultState());
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return raw ? normalizeState(JSON.parse(raw)) : normalizeState(buildDefaultState());
    } catch {
        return normalizeState(buildDefaultState());
    }
};

let savedState = loadSavedState();
let draftState = clone(savedState);
let lastLiveopsSnapshot = null;
const listeners = new Set();

const emit = () => {
    const snapshot = clone(draftState);
    applyCatalogSync(snapshot);
    listeners.forEach((listener) => listener(snapshot));
};

applyCatalogSync(draftState);

export const getContentStudioDefaults = () => normalizeState(buildDefaultState());
export const getContentStudioSaved = () => clone(savedState);
export const getContentStudioSnapshot = () => clone(draftState);
export const getContentWeaponIds = () => draftState.weapons.map((item) => item.weaponId);
export const getContentStudioAdminKey = () => {
    if (typeof window === 'undefined' || !window.localStorage) return '';
    return `${window.localStorage.getItem(ADMIN_KEY_STORAGE_KEY) || ''}`;
};
export const setContentStudioAdminKey = (value) => {
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(ADMIN_KEY_STORAGE_KEY, `${value || ''}`.trim());
    }
    return getContentStudioAdminKey();
};

export const getStudioWeaponCatalogItems = () => draftState.weapons.map((weapon) => ({
    weaponId: weapon.weaponId,
    displayName: weapon.displayName,
    description: weapon.description,
    category: weapon.category,
    priceCoin: weapon.priceCoin,
    rarity: weapon.rarity,
    dropWeight: weapon.dropWeight,
    iconPath: weapon.iconPath,
    modelPath: weapon.modelPath,
    modelPosition: clone(weapon.modelPosition),
    modelRotation: clone(weapon.modelRotation),
    modelScale: clone(weapon.modelScale),
    enabled: weapon.enabled !== false,
    slot: weapon.slot,
    placeholderRig: weapon.placeholderRig,
    stats: clone(weapon.stats),
}));

export const getStudioCaseCatalogItems = () => draftState.cases
    .filter((item) => item.enabled !== false)
    .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        offerId: item.offerId,
        openPriceCoin: item.openPriceCoin,
        priceCoin: item.priceCoin,
        enabled: item.enabled !== false,
        drops: clone(item.drops),
    }));

export const getStudioShopOffers = () => ([
    ...draftState.cases
        .filter((item) => item.enabled !== false)
        .map((item) => ({
            id: item.offerId,
            title: item.title,
            type: 'case',
            caseId: item.id,
            priceCoin: item.priceCoin,
            description: item.description,
        })),
    ...draftState.packs
        .filter((item) => item.enabled !== false)
        .map((item) => ({
            id: item.id,
            title: item.title,
            type: 'bundle',
            bundleSize: Math.max(1, item.weaponIds.length || 1),
            priceCoin: item.priceCoin,
            description: item.description,
        })),
]);

export const updateContentStudio = (mutator) => {
    const next = clone(draftState);
    mutator(next);
    draftState = normalizeState(next);
    emit();
    return getContentStudioSnapshot();
};

export const saveContentStudio = () => {
    savedState = normalizeState(draftState);
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    }
    emit();
    return getContentStudioSaved();
};

export const loadContentStudioFromBackend = async (adminKey, options = {}) => {
    const safeKey = `${adminKey || getContentStudioAdminKey() || ''}`.trim();
    if (!safeKey) throw new Error('Admin key required');
    const response = await backendApi.getLiveopsConfig(safeKey);
    lastLiveopsSnapshot = clone(response.liveops);
    const next = createStateFromLiveops(response.liveops);
    if (options.setAdminKey !== false) setContentStudioAdminKey(safeKey);
    savedState = clone(next);
    draftState = clone(next);
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    }
    emit();
    return { state: getContentStudioSnapshot(), liveops: response.liveops };
};

export const saveContentStudioToBackend = async (adminKey) => {
    const safeKey = `${adminKey || getContentStudioAdminKey() || ''}`.trim();
    if (!safeKey) throw new Error('Admin key required');
    if (!lastLiveopsSnapshot) {
        const preload = await backendApi.getLiveopsConfig(safeKey);
        lastLiveopsSnapshot = clone(preload.liveops);
    }
    const payload = createLiveopsPayload(draftState, lastLiveopsSnapshot);
    const response = await backendApi.updateLiveopsConfig(safeKey, payload);
    lastLiveopsSnapshot = clone(response.liveops);
    const next = createStateFromLiveops(response.liveops);
    setContentStudioAdminKey(safeKey);
    savedState = clone(next);
    draftState = clone(next);
    if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    }
    emit();
    return { state: getContentStudioSnapshot(), liveops: response.liveops };
};

export const uploadContentStudioAsset = async (adminKey, options) => {
    const safeKey = `${adminKey || getContentStudioAdminKey() || ''}`.trim();
    if (!safeKey) throw new Error('Admin key required');
    const file = options?.file;
    if (!file) throw new Error('File required');
    const dataBase64 = await fileToBase64(file);
    const response = await backendApi.uploadLiveopsAsset(safeKey, {
        target: options?.target,
        entityId: options?.entityId,
        fileName: file.name,
        mimeType: file.type,
        dataBase64,
    });
    return response.publicPath;
};

export const revertContentStudioDraft = () => {
    draftState = clone(savedState);
    emit();
    return getContentStudioSnapshot();
};

export const resetContentStudioDraft = () => {
    draftState = normalizeState(buildDefaultState());
    emit();
    return getContentStudioSnapshot();
};

export const subscribeContentStudio = (listener) => {
    listeners.add(listener);
    listener(getContentStudioSnapshot());
    return () => listeners.delete(listener);
};
