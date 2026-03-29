import { createDefaultProgressionConfig, normalizeProgressionConfig } from './progression.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

const toInt = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const toPositiveInt = (value, fallback) => toInt(value, fallback, 1);

const ensureString = (value, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
};

const ensureVec3 = (value, fallback = [0, 0, 0]) => {
    const source = Array.isArray(value) ? value : fallback;
    return [0, 1, 2].map((index) => {
        const numeric = Number(source?.[index]);
        return Number.isFinite(numeric) ? numeric : Number(fallback?.[index] || 0);
    });
};

const RARITY_SET = new Set([
    'consumer',
    'industrial',
    'milspec',
    'restricted',
    'classified',
    'covert',
    'contraband',
]);

const SLOT_SET = new Set(['primary', 'secondary', 'knife', 'character']);
const LOADOUT_SLOT_SET = new Set(['primary', 'secondary', 'knife']);

const BASE_WEAPON_CATALOG = [
    {
        weaponId: 'glock18',
        displayName: 'Glock-18',
        description: 'Sidearm pistol profile.',
        category: 'Pistols',
        priceCoin: 200,
        rarity: 'milspec',
        dropWeight: 10,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'secondary',
        placeholderRig: 'usp',
        stats: { damage: 30, fireRate: 60 / 400, magazine: 20, reserve: 120, speed: 240, classification: 'pistol' },
    },
    {
        weaponId: 'usp_s',
        displayName: 'USP-S',
        description: 'Silenced pistol profile.',
        category: 'Pistols',
        priceCoin: 200,
        rarity: 'milspec',
        dropWeight: 10,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'secondary',
        placeholderRig: 'usp',
        stats: { damage: 35, fireRate: 60 / 352, magazine: 12, reserve: 24, speed: 240, classification: 'pistol' },
    },
    {
        weaponId: 'deagle',
        displayName: 'Desert Eagle',
        description: 'Heavy pistol profile.',
        category: 'Pistols',
        priceCoin: 700,
        rarity: 'restricted',
        dropWeight: 9,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'secondary',
        placeholderRig: 'usp',
        stats: { damage: 53, fireRate: 60 / 267, magazine: 7, reserve: 35, speed: 230, classification: 'pistol' },
    },
    {
        weaponId: 'mac10',
        displayName: 'MAC-10',
        description: 'Fast SMG profile.',
        category: 'SMG',
        priceCoin: 1050,
        rarity: 'milspec',
        dropWeight: 12,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 29, fireRate: 60 / 800, magazine: 30, reserve: 100, speed: 240, classification: 'smg' },
    },
    {
        weaponId: 'mp9',
        displayName: 'MP9',
        description: 'Mobile SMG profile.',
        category: 'SMG',
        priceCoin: 1250,
        rarity: 'milspec',
        dropWeight: 12,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 26, fireRate: 60 / 857, magazine: 30, reserve: 120, speed: 240, classification: 'smg' },
    },
    {
        weaponId: 'p90',
        displayName: 'P90',
        description: 'Large mag SMG profile.',
        category: 'SMG',
        priceCoin: 2350,
        rarity: 'restricted',
        dropWeight: 8,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 26, fireRate: 60 / 857, magazine: 50, reserve: 100, speed: 230, classification: 'smg' },
    },
    {
        weaponId: 'ak47',
        displayName: 'AK-47',
        description: 'Main rifle profile.',
        category: 'Rifles',
        priceCoin: 2700,
        rarity: 'classified',
        dropWeight: 7,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 36, fireRate: 60 / 600, magazine: 30, reserve: 90, speed: 215, classification: 'rifle' },
    },
    {
        weaponId: 'm4a1_s',
        displayName: 'M4A1-S',
        description: 'Silenced rifle profile.',
        category: 'Rifles',
        priceCoin: 2900,
        rarity: 'classified',
        dropWeight: 7,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 38, fireRate: 60 / 600, magazine: 20, reserve: 80, speed: 225, classification: 'rifle' },
    },
    {
        weaponId: 'sg553',
        displayName: 'SG 553',
        description: 'Scoped rifle profile.',
        category: 'Rifles',
        priceCoin: 3000,
        rarity: 'restricted',
        dropWeight: 7,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 30, fireRate: 60 / 545, magazine: 30, reserve: 90, speed: 210, classification: 'rifle' },
    },
    {
        weaponId: 'aug',
        displayName: 'AUG',
        description: 'Scoped CT rifle profile.',
        category: 'Rifles',
        priceCoin: 3300,
        rarity: 'restricted',
        dropWeight: 7,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 28, fireRate: 60 / 600, magazine: 30, reserve: 90, speed: 220, classification: 'rifle' },
    },
    {
        weaponId: 'awp',
        displayName: 'AWP',
        description: 'High damage sniper profile.',
        category: 'Sniper',
        priceCoin: 4750,
        rarity: 'covert',
        dropWeight: 4,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 115, fireRate: 60 / 41, magazine: 5, reserve: 30, speed: 200, classification: 'sniper' },
    },
    {
        weaponId: 'xm1014',
        displayName: 'XM1014',
        description: 'Auto shotgun profile.',
        category: 'Shotgun',
        priceCoin: 2000,
        rarity: 'milspec',
        dropWeight: 9,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 20, fireRate: 60 / 171, magazine: 7, reserve: 32, speed: 215, classification: 'shotgun' },
    },
    {
        weaponId: 'negev',
        displayName: 'Negev',
        description: 'Machinegun profile.',
        category: 'Machinegun',
        priceCoin: 1700,
        rarity: 'restricted',
        dropWeight: 8,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'primary',
        placeholderRig: 'ak',
        stats: { damage: 35, fireRate: 60 / 800, magazine: 150, reserve: 200, speed: 195, classification: 'machinegun' },
    },
    {
        weaponId: 'm9',
        displayName: 'M9 Knife',
        description: 'Knife profile.',
        category: 'Knife',
        priceCoin: 0,
        rarity: 'covert',
        dropWeight: 2,
        iconPath: '',
        modelPath: '',
        enabled: true,
        slot: 'knife',
        placeholderRig: 'm9',
        stats: { damage: 55, fireRate: 0.5, magazine: 1, reserve: 0, speed: 250, classification: 'knife' },
    },
];

const DEFAULT_LOADOUT = {
    primary: 'ak47',
    secondary: 'usp_s',
    knife: 'm9',
};

const createDefaultContentStudio = () => ({
    packs: [
        {
            id: 'rifle_core_pack',
            title: 'Rifle Core Pack',
            description: 'Main rifle bundle for liveops editing.',
            priceCoin: 6900,
            enabled: true,
            weaponIds: ['ak47', 'm4a1_s', 'sg553', 'aug', 'awp'],
        },
    ],
    players: [
        { id: 'default_ct_operator', title: 'CT Operator', description: 'Future player content slot.', enabled: true },
    ],
    maps: [
        { id: 'mirage_map', title: 'Mirage', description: 'Future map content slot.', enabled: true },
    ],
});

const createWeaponSkinPool = () => {
    const perWeapon = {
        glock18: ['Glock-18 | Pulse', 'Glock-18 | Carbon Dot', 'Glock-18 | Sunset Drift'],
        usp_s: ['USP-S | Crimson Thread', 'USP-S | Nightline', 'USP-S | Arctic Veil'],
        deagle: ['Desert Eagle | Brass Viper', 'Desert Eagle | Obsidian Edge', 'Desert Eagle | Sand Strike'],
        mac10: ['MAC-10 | Reactor', 'MAC-10 | Urban Grid', 'MAC-10 | Ember Wire'],
        mp9: ['MP9 | Neon Flux', 'MP9 | Frost Circuit', 'MP9 | Delta Carbon'],
        p90: ['P90 | Ion Bloom', 'P90 | Amber Mesh', 'P90 | Deep Scope'],
        ak47: ['AK-47 | Forest Camo', 'AK-47 | Obsidian Rail', 'AK-47 | Copper Burst'],
        m4a1_s: ['M4A1-S | White Fang', 'M4A1-S | Night Pulse', 'M4A1-S | Blue Fiber'],
        sg553: ['SG 553 | Mirage Sand', 'SG 553 | Signal Jam', 'SG 553 | Polar Front'],
        aug: ['AUG | Stormline', 'AUG | Cobalt Trace', 'AUG | Desert Cell'],
        awp: ['AWP | Carbon Fade', 'AWP | Icecore', 'AWP | Ember Crown'],
        xm1014: ['XM1014 | Quarry', 'XM1014 | Black Tape', 'XM1014 | Frostmark'],
        negev: ['Negev | Heavy Alloy', 'Negev | Hazard Mesh', 'Negev | Crimson Plate'],
    };
    return perWeapon;
};

const WEAPON_SKIN_POOL = createWeaponSkinPool();

const flattenWeaponSkins = () => {
    const output = [];
    const byId = new Map(BASE_WEAPON_CATALOG.map((item) => [item.weaponId, item]));
    Object.keys(WEAPON_SKIN_POOL).forEach((weaponId) => {
        const names = WEAPON_SKIN_POOL[weaponId] || [];
        const meta = byId.get(weaponId);
        if (!meta) return;
        names.forEach((name, idx) => {
            const rarity = idx === 0 ? 'milspec' : idx === 1 ? 'restricted' : 'classified';
            output.push({
                skin: name,
                weaponId,
                slot: meta.slot,
                rarity,
            });
        });
    });
    return output;
};

const DEMO_WEAPON_SKINS = flattenWeaponSkins();

const DEMO_CHARACTER_SKINS = [
    { skin: 'Operator | Urban Heavy', slot: 'character', rarity: 'classified' },
    { skin: 'Operator | Dust Patrol', slot: 'character', rarity: 'restricted' },
    { skin: 'Operator | Mirage Ghost', slot: 'character', rarity: 'covert' },
];

const DEMO_KNIFE_SKINS = [
    { skin: 'M9 | Night Stripe', weaponId: 'm9', slot: 'knife', rarity: 'classified' },
    { skin: 'M9 | Fade Wire', weaponId: 'm9', slot: 'knife', rarity: 'covert' },
    { skin: 'M9 | Gold Spine', weaponId: 'm9', slot: 'knife', rarity: 'contraband' },
];

const buildCaseDrops = (items) => items.map((item) => ({
    skin: item.skin,
    weaponId: item.weaponId || '',
    slot: item.slot || 'primary',
    rarity: item.rarity || 'milspec',
    weight: toPositiveInt(item.weight, 10),
}));

const selectSkins = (weaponIds, rarity = 'milspec', weight = 12) => {
    const result = [];
    weaponIds.forEach((weaponId) => {
        const pool = (WEAPON_SKIN_POOL[weaponId] || []).slice(0, 3);
        pool.forEach((skinName, idx) => {
            result.push({
                skin: skinName,
                weaponId,
                slot: (BASE_WEAPON_CATALOG.find((item) => item.weaponId === weaponId) || {}).slot || 'primary',
                rarity: idx === 0 ? rarity : idx === 1 ? 'restricted' : 'classified',
                weight: Math.max(2, weight - (idx * 3)),
            });
        });
    });
    return result;
};

const createDefaultCases = () => {
    const caseAlpha = [
        ...selectSkins(['ak47', 'usp_s', 'mp9', 'xm1014'], 'milspec', 15),
        ...DEMO_CHARACTER_SKINS.map((item, idx) => ({ ...item, weight: 4 - idx })),
    ];
    const caseBravo = [
        ...selectSkins(['m4a1_s', 'deagle', 'p90', 'sg553'], 'restricted', 13),
        ...DEMO_KNIFE_SKINS.map((item, idx) => ({ ...item, weight: 3 - idx })),
    ];
    const caseCharlie = [
        ...selectSkins(['awp', 'aug', 'negev', 'mac10'], 'restricted', 12),
        ...DEMO_CHARACTER_SKINS.map((item, idx) => ({ ...item, rarity: idx === 2 ? 'covert' : 'classified', weight: 3 - idx })),
    ];
    const caseDelta = [
        ...DEMO_WEAPON_SKINS.map((item) => ({ ...item, weight: item.rarity === 'classified' ? 6 : item.rarity === 'restricted' ? 10 : 14 })),
        ...DEMO_KNIFE_SKINS.map((item, idx) => ({ ...item, weight: 4 - idx })),
        ...DEMO_CHARACTER_SKINS.map((item, idx) => ({ ...item, weight: 4 - idx })),
    ];

    return {
        falcon_case: {
            id: 'falcon_case',
            title: 'Falcon Case',
            description: 'Balanced drops for core rifles and pistols.',
            offerId: 'case_falcon',
            openPriceCoin: 180,
            priceCoin: 180,
            enabled: true,
            drops: buildCaseDrops(caseAlpha),
        },
        mirage_case: {
            id: 'mirage_case',
            title: 'Mirage Case',
            description: 'Higher tier drops with knife chance.',
            offerId: 'case_mirage',
            openPriceCoin: 320,
            priceCoin: 320,
            enabled: true,
            drops: buildCaseDrops(caseBravo),
        },
        arsenal_case: {
            id: 'arsenal_case',
            title: 'Arsenal Case',
            description: 'Heavy and sniper focused pool.',
            offerId: 'case_arsenal',
            openPriceCoin: 420,
            priceCoin: 420,
            enabled: true,
            drops: buildCaseDrops(caseCharlie),
        },
        vortex_case: {
            id: 'vortex_case',
            title: 'Vortex Case',
            description: 'Premium mixed pool with covert cosmetics.',
            offerId: 'case_vortex',
            openPriceCoin: 520,
            priceCoin: 520,
            enabled: true,
            drops: buildCaseDrops(caseDelta),
        },
    };
};

const createStorefrontOffers = () => {
    const offers = [
        { id: 'case_falcon', title: 'Falcon Case', type: 'case', caseId: 'falcon_case', priceCoin: 180, description: 'Balanced drops for core rifles and pistols.' },
        { id: 'case_mirage', title: 'Mirage Case', type: 'case', caseId: 'mirage_case', priceCoin: 320, description: 'Higher tier drops with knife chance.' },
        { id: 'case_arsenal', title: 'Arsenal Case', type: 'case', caseId: 'arsenal_case', priceCoin: 420, description: 'Heavy and sniper focused pool.' },
        { id: 'case_vortex', title: 'Vortex Case', type: 'case', caseId: 'vortex_case', priceCoin: 520, description: 'Premium mixed pool with covert cosmetics.' },
    ];

    DEMO_WEAPON_SKINS.slice(0, 12).forEach((skin, idx) => {
        offers.push({
            id: `skin_weapon_${idx + 1}`,
            title: skin.skin,
            type: 'skin',
            slot: skin.slot,
            skin: skin.skin,
            weaponId: skin.weaponId,
            rarity: skin.rarity,
            priceCoin: 260 + (idx * 25),
            description: `${(skin.weaponId || 'weapon').toUpperCase()} demo skin.`,
        });
    });

    DEMO_CHARACTER_SKINS.forEach((skin, idx) => {
        offers.push({
            id: `skin_character_${idx + 1}`,
            title: skin.skin,
            type: 'skin',
            slot: 'character',
            skin: skin.skin,
            rarity: skin.rarity,
            priceCoin: 640 + (idx * 80),
            description: 'Character cosmetic demo.',
        });
    });

    DEMO_KNIFE_SKINS.forEach((skin, idx) => {
        offers.push({
            id: `skin_knife_${idx + 1}`,
            title: skin.skin,
            type: 'skin',
            slot: 'knife',
            skin: skin.skin,
            weaponId: 'm9',
            rarity: skin.rarity,
            priceCoin: 760 + (idx * 100),
            description: 'Knife cosmetic demo.',
        });
    });

    return offers;
};

const sanitizePlacementRewards = (raw, fallback) => {
    const source = (raw && typeof raw === 'object') ? raw : {};
    return {
        1: toInt(source[1], fallback[1], 0),
        2: toInt(source[2], fallback[2], 0),
        3: toInt(source[3], fallback[3], 0),
        other: toInt(source.other, fallback.other, 0),
    };
};

const sanitizeWeaponCatalog = (rawCatalog, fallbackCatalog) => {
    const source = Array.isArray(rawCatalog) ? rawCatalog : fallbackCatalog;
    const output = [];
    source.forEach((item, index) => {
        const fallback = fallbackCatalog[index] || fallbackCatalog[0];
        const weaponId = ensureString(item?.weaponId, fallback.weaponId || `weapon_${index + 1}`).toLowerCase();
        const slotCandidate = ensureString(item?.slot, fallback.slot || 'primary').toLowerCase();
        const slot = LOADOUT_SLOT_SET.has(slotCandidate) ? slotCandidate : (fallback.slot || 'primary');
        const rigCandidate = ensureString(item?.placeholderRig, fallback.placeholderRig || 'ak').toLowerCase();
        const placeholderRig = ['ak', 'usp', 'm9'].includes(rigCandidate) ? rigCandidate : (fallback.placeholderRig || 'ak');
        const statsRaw = item?.stats && typeof item.stats === 'object' ? item.stats : {};
        const fallbackStats = fallback.stats || {};

        output.push({
            weaponId,
            displayName: ensureString(item?.displayName, fallback.displayName || weaponId),
            description: ensureString(item?.description, fallback.description || `${fallback.displayName || weaponId} profile.`),
            category: ensureString(item?.category, fallback.category || 'Rifles'),
            priceCoin: toInt(item?.priceCoin, fallback.priceCoin || 0, 0),
            rarity: ensureString(item?.rarity, fallback.rarity || 'milspec').toLowerCase(),
            dropWeight: toInt(item?.dropWeight, fallback.dropWeight || 10, 0),
            iconPath: ensureString(item?.iconPath, fallback.iconPath || ''),
            modelPath: ensureString(item?.modelPath, fallback.modelPath || ''),
            modelPosition: ensureVec3(item?.modelPosition, fallback.modelPosition || [0.02, 0.98, 0.44]),
            modelRotation: ensureVec3(item?.modelRotation, fallback.modelRotation || [0, 180, 0]),
            modelScale: ensureVec3(item?.modelScale, fallback.modelScale || [1, 1, 1]),
            enabled: item?.enabled !== false,
            slot,
            placeholderRig,
            stats: {
                damage: toInt(statsRaw.damage, fallbackStats.damage || 30, 1),
                fireRate: Number.isFinite(Number(statsRaw.fireRate)) ? Math.max(0.05, Number(statsRaw.fireRate)) : Number(fallbackStats.fireRate || 0.12),
                magazine: toInt(statsRaw.magazine, fallbackStats.magazine || 30, 1),
                reserve: toInt(statsRaw.reserve, fallbackStats.reserve || 90, 0),
                speed: toInt(statsRaw.speed, fallbackStats.speed || 220, 120),
                classification: ensureString(statsRaw.classification, fallbackStats.classification || 'rifle'),
            },
        });
    });

    const byId = new Map();
    output.forEach((item) => {
        if (!item.weaponId || byId.has(item.weaponId)) return;
        byId.set(item.weaponId, item);
    });
    return [...byId.values()];
};

const normalizeDropMeta = (drop, fallbackDrop = null) => {
    const fallback = fallbackDrop || { skin: 'Unknown Skin', rarity: 'milspec', weight: 1, slot: 'primary', weaponId: '' };
    const rarityCandidate = ensureString(drop?.rarity, fallback.rarity).toLowerCase();
    const slotCandidate = ensureString(drop?.slot, fallback.slot).toLowerCase();
    return {
        skin: ensureString(drop?.skin, fallback.skin),
        weaponId: ensureString(drop?.weaponId, fallback.weaponId || '').toLowerCase(),
        rarity: RARITY_SET.has(rarityCandidate) ? rarityCandidate : fallback.rarity,
        weight: toPositiveInt(drop?.weight, fallback.weight || 1),
        slot: SLOT_SET.has(slotCandidate) ? slotCandidate : (fallback.slot || 'primary'),
    };
};

const sanitizeDrops = (rawDrops, fallbackDrops) => {
    const source = Array.isArray(rawDrops) ? rawDrops : fallbackDrops;
    const output = source.map((drop, idx) => normalizeDropMeta(drop, fallbackDrops[idx] || fallbackDrops[0]));
    return output.filter((item) => !!item.skin);
};

const sanitizeCaseDef = (rawCase, fallbackCase) => {
    return {
        id: ensureString(rawCase?.id, fallbackCase.id),
        title: ensureString(rawCase?.title, fallbackCase.title),
        description: ensureString(rawCase?.description, fallbackCase.description || ''),
        offerId: ensureString(rawCase?.offerId, fallbackCase.offerId || `offer_${fallbackCase.id}`),
        openPriceCoin: toPositiveInt(rawCase?.openPriceCoin, fallbackCase.openPriceCoin || 180),
        priceCoin: toPositiveInt(rawCase?.priceCoin ?? rawCase?.openPriceCoin, fallbackCase.priceCoin || fallbackCase.openPriceCoin || 180),
        enabled: rawCase?.enabled !== false,
        drops: sanitizeDrops(rawCase?.drops, fallbackCase.drops || []),
    };
};

const sanitizeContentEntity = (raw, fallback = {}, prefix = 'item') => ({
    id: ensureString(raw?.id, fallback.id || `${prefix}_1`).toLowerCase(),
    title: ensureString(raw?.title, fallback.title || fallback.id || prefix),
    description: ensureString(raw?.description, fallback.description || ''),
    enabled: raw?.enabled !== false,
});

const sanitizePlayerEntity = (raw, fallback = {}, index = 0) => {
    const base = sanitizeContentEntity(raw, fallback, 'player');
    const meshVisibility = raw?.meshVisibility && typeof raw.meshVisibility === 'object' ? raw.meshVisibility : {};
    const normalizedVisibility = {};
    Object.keys(meshVisibility).forEach((key) => {
        const safeKey = ensureString(key, '');
        if (!safeKey) return;
        normalizedVisibility[safeKey] = meshVisibility[key] !== false;
    });
    const variantPresets = Array.isArray(raw?.variantPresets) ? raw.variantPresets : [];
    return {
        ...base,
        iconPath: ensureString(raw?.iconPath, fallback.iconPath || ''),
        modelPath: ensureString(raw?.modelPath, fallback.modelPath || ''),
        animationPath: ensureString(raw?.animationPath, fallback.animationPath || ''),
        modelPosition: ensureVec3(raw?.modelPosition, fallback.modelPosition || [0, 0, 0]),
        modelRotation: ensureVec3(raw?.modelRotation, fallback.modelRotation || [0, 180, 0]),
        modelScale: ensureVec3(raw?.modelScale, fallback.modelScale || [1, 1, 1]),
        meshVisibility: normalizedVisibility,
        variantPresets: variantPresets.map((preset, presetIndex) => ({
            id: ensureString(preset?.id, `variant_${presetIndex + 1}`).toLowerCase(),
            title: ensureString(preset?.title, preset?.id || `Variant ${presetIndex + 1}`),
            visibleMeshes: Array.isArray(preset?.visibleMeshes) ? preset.visibleMeshes.map((item) => ensureString(item, '')).filter(Boolean) : [],
        })),
        activeVariantId: ensureString(raw?.activeVariantId, fallback.activeVariantId || '').toLowerCase(),
    };
};

const sanitizeContentStudio = (raw, weaponsCatalog, fallback) => {
    const source = raw && typeof raw === 'object' ? raw : {};
    const packs = Array.isArray(source.packs) ? source.packs : fallback.packs;
    const players = Array.isArray(source.players) ? source.players : fallback.players;
    const maps = Array.isArray(source.maps) ? source.maps : fallback.maps;
    const weaponIds = new Set((Array.isArray(weaponsCatalog) ? weaponsCatalog : []).map((item) => item.weaponId));
    return {
        packs: packs.map((item, index) => ({
            ...sanitizeContentEntity(item, fallback.packs[index] || { id: `pack_${index + 1}`, title: `Pack ${index + 1}` }, 'pack'),
            priceCoin: toInt(item?.priceCoin, fallback.packs[index]?.priceCoin || 0, 0),
            weaponIds: Array.isArray(item?.weaponIds) ? item.weaponIds.map((weaponId) => ensureString(weaponId, '').toLowerCase()).filter((weaponId) => weaponIds.has(weaponId)) : [],
        })),
        players: players.map((item, index) => sanitizePlayerEntity(item, fallback.players[index] || { id: `player_${index + 1}`, title: `Player ${index + 1}` }, index)),
        maps: maps.map((item, index) => sanitizeContentEntity(item, fallback.maps[index] || { id: `map_${index + 1}`, title: `Map ${index + 1}` }, 'map')),
    };
};

const sanitizeStorefrontOffers = (rawOffers, fallbackOffers, casesMap) => {
    const source = Array.isArray(rawOffers) ? rawOffers : fallbackOffers;
    const normalized = [];

    source.forEach((offer, index) => {
        const fallback = fallbackOffers[index] || fallbackOffers[0] || {};
        const type = ensureString(offer?.type, fallback.type || 'case');
        const id = ensureString(offer?.id, fallback.id || `offer_${index + 1}`);
        const title = ensureString(offer?.title, fallback.title || id);
        const priceCoin = toPositiveInt(offer?.priceCoin ?? offer?.price, fallback.priceCoin || fallback.price || 180);
        const description = ensureString(offer?.description, fallback.description || '');

        if (type === 'case') {
            const caseIdCandidate = ensureString(offer?.caseId, fallback.caseId || 'falcon_case');
            const caseId = casesMap[caseIdCandidate] ? caseIdCandidate : (casesMap.falcon_case ? 'falcon_case' : Object.keys(casesMap)[0]);
            if (!caseId) return;
            normalized.push({ id, title, type: 'case', caseId, priceCoin, price: priceCoin, description });
            return;
        }

        if (type === 'skin') {
            const skin = ensureString(offer?.skin, fallback.skin || '');
            if (!skin) return;
            const rarityCandidate = ensureString(offer?.rarity, fallback.rarity || 'milspec').toLowerCase();
            const slotCandidate = ensureString(offer?.slot, fallback.slot || 'primary').toLowerCase();
            normalized.push({
                id,
                title,
                type: 'skin',
                slot: SLOT_SET.has(slotCandidate) ? slotCandidate : 'primary',
                skin,
                weaponId: ensureString(offer?.weaponId, fallback.weaponId || '').toLowerCase(),
                rarity: RARITY_SET.has(rarityCandidate) ? rarityCandidate : 'milspec',
                priceCoin,
                price: priceCoin,
                description,
            });
            return;
        }

        if (type === 'bundle') {
            const bundleSize = toPositiveInt(offer?.bundleSize, fallback.bundleSize || 3);
            normalized.push({ id, title, type: 'bundle', bundleSize, priceCoin, price: priceCoin, description });
        }
    });

    return normalized.length ? normalized : clone(fallbackOffers);
};

export const normalizeLoadout = (rawLoadout, liveopsOrCatalog) => {
    const catalog = Array.isArray(liveopsOrCatalog)
        ? liveopsOrCatalog
        : (liveopsOrCatalog?.weaponsCatalog || BASE_WEAPON_CATALOG);
    const defaultLoadout = Array.isArray(liveopsOrCatalog)
        ? DEFAULT_LOADOUT
        : (liveopsOrCatalog?.defaultLoadout || DEFAULT_LOADOUT);

    const byId = new Map(catalog.map((item) => [item.weaponId, item]));
    const pickForSlot = (slot, preferredId, fallbackId) => {
        const preferred = ensureString(preferredId, '').toLowerCase();
        const fallback = ensureString(fallbackId, '').toLowerCase();
        if (preferred && byId.has(preferred) && byId.get(preferred).slot === slot) return preferred;
        if (fallback && byId.has(fallback) && byId.get(fallback).slot === slot) return fallback;
        const found = catalog.find((item) => item.slot === slot);
        return found ? found.weaponId : '';
    };

    const source = rawLoadout && typeof rawLoadout === 'object' ? rawLoadout : {};
    return {
        primary: pickForSlot('primary', source.primary, defaultLoadout.primary),
        secondary: pickForSlot('secondary', source.secondary, defaultLoadout.secondary),
        knife: pickForSlot('knife', source.knife, defaultLoadout.knife),
    };
};

export const createDefaultLiveops = () => {
    const now = new Date().toISOString();
    return {
        currency: 'coin',
        revision: 1,
        updatedAt: now,
        economy: {
            starterWallet: 1200,
            killBonus: 6,
            placementRewards: {
                1: 220,
                2: 140,
                3: 90,
                other: 0,
            },
            winBonus: 120,
        },
        weaponsCatalog: clone(BASE_WEAPON_CATALOG),
        defaultLoadout: clone(DEFAULT_LOADOUT),
        cases: createDefaultCases(),
        contentStudio: createDefaultContentStudio(),
        progression: createDefaultProgressionConfig(),
        storefront: {
            offers: createStorefrontOffers(),
        },
    };
};

export const normalizeLiveops = (raw) => {
    const fallback = createDefaultLiveops();
    if (!raw || typeof raw !== 'object') return fallback;

    const cases = {};
    const fallbackCases = fallback.cases;
    const rawCases = raw.cases && typeof raw.cases === 'object' ? raw.cases : {};

    Object.keys(fallbackCases).forEach((caseId) => {
        cases[caseId] = sanitizeCaseDef(rawCases[caseId], fallbackCases[caseId]);
    });

    Object.keys(rawCases).forEach((caseId) => {
        if (cases[caseId]) return;
        const baseFallback = {
            id: caseId,
            title: caseId,
            openPriceCoin: 180,
            drops: fallbackCases.falcon_case ? fallbackCases.falcon_case.drops : [],
        };
        cases[caseId] = sanitizeCaseDef(rawCases[caseId], baseFallback);
    });

    const economyRaw = raw.economy && typeof raw.economy === 'object' ? raw.economy : {};
    const economyFallback = fallback.economy;

    const economy = {
        starterWallet: toInt(economyRaw.starterWallet, economyFallback.starterWallet, 0),
        killBonus: toInt(economyRaw.killBonus, economyFallback.killBonus, 0),
        placementRewards: sanitizePlacementRewards(economyRaw.placementRewards, economyFallback.placementRewards),
        winBonus: toInt(economyRaw.winBonus, economyFallback.winBonus, 0),
    };

    const weaponsCatalog = sanitizeWeaponCatalog(raw.weaponsCatalog, fallback.weaponsCatalog);
    const defaultLoadout = normalizeLoadout(raw.defaultLoadout, { weaponsCatalog, defaultLoadout: fallback.defaultLoadout });

    const storefrontRaw = raw.storefront && typeof raw.storefront === 'object' ? raw.storefront : {};
    const storefront = {
        offers: sanitizeStorefrontOffers(storefrontRaw.offers, fallback.storefront.offers, cases),
    };

    const progression = normalizeProgressionConfig(raw.progression);
    const contentStudio = sanitizeContentStudio(raw.contentStudio, weaponsCatalog, fallback.contentStudio);

    return {
        currency: ensureString(raw.currency, fallback.currency).toLowerCase() === 'coin' ? 'coin' : fallback.currency,
        revision: toPositiveInt(raw.revision, fallback.revision),
        updatedAt: ensureString(raw.updatedAt, fallback.updatedAt),
        economy,
        weaponsCatalog,
        defaultLoadout,
        cases,
        contentStudio,
        progression,
        storefront,
    };
};

export const getCasesArray = (liveops) => Object.values((liveops && liveops.cases) || {});

export const getCaseById = (liveops, caseId) => {
    if (!liveops || !liveops.cases) return null;
    return liveops.cases[caseId] || null;
};

export const getShopOffers = (liveops) => {
    const offers = liveops?.storefront?.offers;
    return Array.isArray(offers) ? offers.filter(Boolean) : [];
};

export const getWeaponsCatalog = (liveops) => {
    const catalog = liveops?.weaponsCatalog;
    return Array.isArray(catalog) ? catalog : clone(BASE_WEAPON_CATALOG);
};

export const getDefaultLoadout = (liveops) => normalizeLoadout(liveops?.defaultLoadout, liveops || { weaponsCatalog: BASE_WEAPON_CATALOG, defaultLoadout: DEFAULT_LOADOUT });

export const pickWeightedDrop = (drops) => {
    const pool = Array.isArray(drops) ? drops : [];
    if (!pool.length) return null;
    const totalWeight = pool.reduce((sum, item) => sum + Math.max(1, Number(item.weight) || 1), 0);
    let cursor = Math.random() * totalWeight;
    for (const item of pool) {
        cursor -= Math.max(1, Number(item.weight) || 1);
        if (cursor <= 0) return item;
    }
    return pool[pool.length - 1];
};

export const buildSpinTrack = (drops, winnerDrop) => {
    const safeDrops = Array.isArray(drops) ? drops : [];
    const fallbackWinner = winnerDrop || safeDrops[0] || { skin: 'Unknown', rarity: 'milspec', slot: 'primary', weaponId: '' };
    const trackLength = 42;
    const stopIndex = 34;
    const durationMs = 4600;
    const spinTrack = [];

    for (let i = 0; i < trackLength; i++) {
        const picked = pickWeightedDrop(safeDrops) || fallbackWinner;
        spinTrack.push({
            skin: picked.skin,
            rarity: picked.rarity || 'milspec',
            slot: picked.slot || 'primary',
            weaponId: picked.weaponId || '',
        });
    }

    spinTrack[stopIndex] = {
        skin: fallbackWinner.skin,
        rarity: fallbackWinner.rarity || 'milspec',
        slot: fallbackWinner.slot || 'primary',
        weaponId: fallbackWinner.weaponId || '',
    };

    return { spinTrack, stopIndex, durationMs };
};

export const findSkinMeta = (liveops, skinName) => {
    const safeSkin = ensureString(skinName, '');
    if (!safeSkin) return null;

    const offers = getShopOffers(liveops);
    const offer = offers.find((item) => item.type === 'skin' && item.skin === safeSkin);
    if (offer) {
        return {
            skin: safeSkin,
            rarity: offer.rarity || 'milspec',
            slot: offer.slot || 'primary',
            weaponId: offer.weaponId || '',
        };
    }

    const cases = getCasesArray(liveops);
    for (const caseDef of cases) {
        const drop = (caseDef.drops || []).find((item) => item.skin === safeSkin);
        if (drop) {
            return {
                skin: safeSkin,
                rarity: drop.rarity || 'milspec',
                slot: drop.slot || 'primary',
                weaponId: drop.weaponId || '',
            };
        }
    }

    return { skin: safeSkin, rarity: 'milspec', slot: 'primary', weaponId: '' };
};

export const buildCasesCatalogResponse = (liveops) => {
    const cases = getCasesArray(liveops).map((caseDef) => {
        const totalWeight = (caseDef.drops || []).reduce((sum, drop) => sum + Math.max(1, Number(drop.weight) || 1), 0);
        const drops = (caseDef.drops || []).map((drop) => {
            const weight = Math.max(1, Number(drop.weight) || 1);
            const chance = totalWeight > 0 ? Number(((weight / totalWeight) * 100).toFixed(2)) : 0;
            return {
                skin: drop.skin,
                rarity: drop.rarity || 'milspec',
                slot: drop.slot || 'primary',
                weaponId: drop.weaponId || '',
                weight,
                chance,
            };
        });

        return {
            id: caseDef.id,
            title: caseDef.title,
            description: caseDef.description || '',
            offerId: caseDef.offerId || '',
            openPriceCoin: Math.max(1, Number(caseDef.openPriceCoin) || 180),
            priceCoin: Math.max(1, Number(caseDef.priceCoin) || Math.max(1, Number(caseDef.openPriceCoin) || 180)),
            enabled: caseDef.enabled !== false,
            drops,
        };
    });

    return {
        currency: liveops?.currency || 'coin',
        revision: Number(liveops?.revision) || 1,
        serverTime: new Date().toISOString(),
        defaultLoadout: getDefaultLoadout(liveops),
        cases,
    };
};

export const computeFfaRewardBreakdown = (economy, payload) => {
    const kills = Math.max(0, Number(payload?.kills) || 0);
    const placement = Math.max(1, Number(payload?.placement) || 1);

    const placementRewards = economy?.placementRewards || {};
    const killValue = Math.max(0, Number(economy?.killBonus) || 0) * kills;
    const placementValue = Number(placementRewards[placement] ?? placementRewards.other ?? 0);
    const winValue = placement === 1 ? Math.max(0, Number(economy?.winBonus) || 0) : 0;
    const total = Math.max(0, Math.floor(killValue + placementValue + winValue));

    return {
        kill: Math.max(0, Math.floor(killValue)),
        placement: Math.max(0, Math.floor(placementValue)),
        win: Math.max(0, Math.floor(winValue)),
        total,
    };
};
