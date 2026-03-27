const normalizeToken = (value) => `${value || ''}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');

export const DEFAULT_AVATAR_ID = 'rookie_ops';

export const AVATAR_CATALOG = [
    { id: 'rookie_ops', label: 'Rookie Ops' },
    { id: 'dust_raider', label: 'Dust Raider' },
    { id: 'hawk_eye', label: 'Hawk Eye' },
    { id: 'night_viper', label: 'Night Viper' },
    { id: 'captain_royal', label: 'Captain Royal' },
    { id: 'premier_ace', label: 'Premier Ace' },
];

const AVATAR_IDS = new Set(AVATAR_CATALOG.map((item) => item.id));

export const sanitizeAvatarId = (value, fallback = DEFAULT_AVATAR_ID) => {
    const fallbackToken = normalizeToken(fallback);
    const safeFallback = !fallbackToken
        ? ''
        : (AVATAR_IDS.has(fallbackToken) ? fallbackToken : DEFAULT_AVATAR_ID);
    const normalized = normalizeToken(value);
    return AVATAR_IDS.has(normalized) ? normalized : safeFallback;
};

export const sanitizeAvatarIdArray = (value, fallback = [DEFAULT_AVATAR_ID]) => {
    const input = Array.isArray(value) ? value : fallback;
    const output = [];
    const used = new Set();

    input.forEach((item) => {
        const safeId = sanitizeAvatarId(item, '');
        if (!safeId || used.has(safeId)) return;
        used.add(safeId);
        output.push(safeId);
    });

    if (!output.length) {
        return [sanitizeAvatarId(fallback[0], DEFAULT_AVATAR_ID)];
    }

    return output;
};

export const getAvatarCatalogSnapshot = () => AVATAR_CATALOG.map((item) => ({ ...item }));
