const toInt = (value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const ensureString = (value, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
};

const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

export const PREMIER_CALIBRATION_MATCHES = 5;
export const PREMIER_SEASON_MONTHS = 3;
export const PREMIER_WINDOW_SIZE = 50;
export const PREMIER_WINDOW_ABOVE = 24;
export const PREMIER_WINDOW_BELOW = 25;

export const createDefaultPremier = () => ({
    rating: 5000,
    matchesPlayed: 0,
    calibrationMatches: PREMIER_CALIBRATION_MATCHES,
    calibrated: false,
    tier: 'unranked',
});

export const sanitizePremier = (raw) => {
    const fallback = createDefaultPremier();
    const matchesPlayed = toInt(raw?.matchesPlayed, fallback.matchesPlayed, 0);
    const calibrationMatches = toInt(raw?.calibrationMatches, fallback.calibrationMatches, 1);
    const calibrated = !!raw?.calibrated || matchesPlayed >= calibrationMatches;

    return {
        rating: toInt(raw?.rating, fallback.rating, 0, 50000),
        matchesPlayed,
        calibrationMatches,
        calibrated,
        tier: getPremierTierId(toInt(raw?.rating, fallback.rating, 0, 50000), calibrated),
    };
};

export const getPremierTierId = (rating, calibrated) => {
    if (!calibrated) return 'unranked';
    const r = toInt(rating, 0, 0);
    if (r >= 30000) return 'gold';
    if (r >= 25000) return 'red';
    if (r >= 20000) return 'pink';
    if (r >= 15000) return 'purple';
    if (r >= 10000) return 'blue';
    if (r >= 5000) return 'cyan';
    return 'gray';
};

export const getPremierTierMeta = (rating, calibrated) => {
    const id = getPremierTierId(rating, calibrated);

    if (id === 'unranked') return { id, label: '?', min: null, max: null, color: '#d6d9e2' };
    if (id === 'gray') return { id, label: '< 4,999', min: 0, max: 4999, color: '#d4d7df' };
    if (id === 'cyan') return { id, label: '5,000 - 9,999', min: 5000, max: 9999, color: '#59d8ff' };
    if (id === 'blue') return { id, label: '10,000 - 14,999', min: 10000, max: 14999, color: '#7ea6ff' };
    if (id === 'purple') return { id, label: '15,000 - 19,999', min: 15000, max: 19999, color: '#bb8dff' };
    if (id === 'pink') return { id, label: '20,000 - 24,999', min: 20000, max: 24999, color: '#e57fff' };
    if (id === 'red') return { id, label: '25,000 - 29,999', min: 25000, max: 29999, color: '#ff7a7a' };
    return { id, label: '30,000+', min: 30000, max: null, color: '#f2d061' };
};

const parseSeasonId = (value) => {
    const match = /^(\d{4})-Q([1-4])$/.exec(`${value || ''}`.trim());
    if (!match) return null;
    return {
        year: toInt(match[1], 0, 1970),
        quarter: toInt(match[2], 1, 1, 4),
    };
};

const getSeasonBounds = (date = new Date()) => {
    const safeDate = date instanceof Date ? date : new Date();
    const year = safeDate.getUTCFullYear();
    const startMonth = Math.floor(safeDate.getUTCMonth() / PREMIER_SEASON_MONTHS) * PREMIER_SEASON_MONTHS;
    const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, startMonth + PREMIER_SEASON_MONTHS, 1, 0, 0, 0, 0));
    const quarter = Math.floor(startMonth / PREMIER_SEASON_MONTHS) + 1;
    return { year, quarter, start, end };
};

export const getPremierSeasonMeta = (input = new Date()) => {
    const parsed = typeof input === 'string' ? parseSeasonId(input) : null;
    if (parsed) {
        const startMonth = (parsed.quarter - 1) * PREMIER_SEASON_MONTHS;
        const start = new Date(Date.UTC(parsed.year, startMonth, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(parsed.year, startMonth + PREMIER_SEASON_MONTHS, 1, 0, 0, 0, 0));
        return {
            id: `${parsed.year}-Q${parsed.quarter}`,
            label: `Q${parsed.quarter} ${parsed.year}`,
            startAt: start.toISOString(),
            endAt: end.toISOString(),
        };
    }

    const bounds = getSeasonBounds(input instanceof Date ? input : new Date());
    return {
        id: `${bounds.year}-Q${bounds.quarter}`,
        label: `Q${bounds.quarter} ${bounds.year}`,
        startAt: bounds.start.toISOString(),
        endAt: bounds.end.toISOString(),
    };
};

const createSeasonRecord = (meta) => ({
    id: meta.id,
    label: meta.label,
    startAt: meta.startAt,
    endAt: meta.endAt,
    players: {},
});

const sanitizeSeasonRecord = (raw, meta) => {
    const safe = isObject(raw) ? raw : {};
    const playersRaw = isObject(safe.players) ? safe.players : {};
    const players = {};

    Object.keys(playersRaw).forEach((userId) => {
        const key = ensureString(userId, '');
        if (!key) return;
        players[key] = sanitizePremier(playersRaw[userId]);
    });

    return {
        id: meta.id,
        label: ensureString(safe.label, meta.label),
        startAt: ensureString(safe.startAt, meta.startAt),
        endAt: ensureString(safe.endAt, meta.endAt),
        players,
    };
};

const shouldPersistProfile = (premier) => {
    const safe = sanitizePremier(premier);
    const fallback = createDefaultPremier();
    return safe.matchesPlayed > 0 || safe.calibrated || safe.rating !== fallback.rating;
};

export const createDefaultPremierStore = (now = new Date()) => {
    const meta = getPremierSeasonMeta(now);
    return {
        currentSeasonId: meta.id,
        seasons: {
            [meta.id]: createSeasonRecord(meta),
        },
    };
};

export const ensurePremierSeason = (premierStore, now = new Date()) => {
    const safeStore = isObject(premierStore) ? premierStore : createDefaultPremierStore(now);
    if (!isObject(safeStore.seasons)) safeStore.seasons = {};

    const meta = getPremierSeasonMeta(now);
    const existing = safeStore.seasons[meta.id];
    safeStore.currentSeasonId = meta.id;
    safeStore.seasons[meta.id] = sanitizeSeasonRecord(existing, meta);
    return safeStore.seasons[meta.id];
};

export const normalizePremierStore = (raw, users = [], now = new Date()) => {
    const fallback = createDefaultPremierStore(now);
    const safe = isObject(raw) ? raw : {};
    const seasonsRaw = isObject(safe.seasons) ? safe.seasons : {};
    const seasons = {};

    Object.keys(seasonsRaw).forEach((seasonId) => {
        const safeId = ensureString(seasonId, '');
        if (!safeId) return;
        const meta = getPremierSeasonMeta(safeId);
        seasons[safeId] = sanitizeSeasonRecord(seasonsRaw[seasonId], meta);
    });

    const store = {
        currentSeasonId: ensureString(safe.currentSeasonId, fallback.currentSeasonId),
        seasons,
    };

    const currentSeason = ensurePremierSeason(store, now);
    if (!Object.keys(currentSeason.players).length && Array.isArray(users)) {
        users.forEach((user) => {
            const userId = ensureString(user?.id, '');
            if (!userId) return;
            if (!shouldPersistProfile(user?.premier)) return;
            currentSeason.players[userId] = sanitizePremier(user.premier);
        });
    }

    return store;
};

export const resolveCurrentPremierProfile = ({ user, userId, premierStore, now = new Date() }) => {
    const season = ensurePremierSeason(premierStore, now);
    const safeUserId = ensureString(userId || user?.id, '');
    if (safeUserId && season.players[safeUserId]) {
        return sanitizePremier(season.players[safeUserId]);
    }

    const fallback = sanitizePremier(user?.premier);
    if (safeUserId && shouldPersistProfile(fallback)) {
        season.players[safeUserId] = fallback;
    }
    return fallback;
};

export const setCurrentPremierProfile = ({ userId, premier, premierStore, now = new Date() }) => {
    const season = ensurePremierSeason(premierStore, now);
    const safeUserId = ensureString(userId, '');
    const normalized = sanitizePremier(premier);
    if (safeUserId && shouldPersistProfile(normalized)) {
        season.players[safeUserId] = normalized;
    } else if (safeUserId && season.players[safeUserId]) {
        delete season.players[safeUserId];
    }
    return normalized;
};

export const syncUserPremierMirror = ({ user, premierStore, now = new Date() }) => {
    if (!user || typeof user !== 'object') return createDefaultPremier();
    const current = resolveCurrentPremierProfile({ user, premierStore, now });
    user.premier = sanitizePremier(current);
    return user.premier;
};

const placementToScore = (placement, playerCount) => {
    const safePlacement = Math.max(1, toInt(placement, 1, 1));
    const safeCount = Math.max(2, toInt(playerCount, 6, 2));
    const normalized = 1 - ((safePlacement - 1) / Math.max(1, safeCount - 1));
    return clamp(normalized, 0, 1);
};

const performanceToScore = ({ kills, deaths, assists, damage, score }) => {
    const combat = clamp(((kills * 1.25) + (assists * 0.72) - (deaths * 0.86)) / 12 + 0.5, 0, 1);
    const dmg = clamp((damage || 0) / 800, 0, 1);
    const scr = clamp((score || 0) / 1400, 0, 1);
    return (combat * 0.58) + (dmg * 0.24) + (scr * 0.18);
};

const expectedScore = (playerRating, opponentAvgRating) => {
    const safePlayer = toInt(playerRating, 5000, 0, 50000);
    const safeOpp = toInt(opponentAvgRating, safePlayer, 0, 50000);
    const exponent = (safeOpp - safePlayer) / 4000;
    return 1 / (1 + Math.pow(10, exponent));
};

export const computePremierUpdate = ({
    premier,
    kills,
    deaths,
    assists,
    damage,
    score,
    placement,
    playerCount,
    opponentAvgElo,
}) => {
    const current = sanitizePremier(premier);
    const before = current.rating;

    const matchNumber = current.matchesPlayed + 1;
    const calibrationMatches = current.calibrationMatches;
    const provisional = matchNumber <= calibrationMatches;

    const placementScore = placementToScore(placement, playerCount);
    const perfScore = performanceToScore({ kills, deaths, assists, damage, score });
    const actual = clamp((placementScore * 0.56) + (perfScore * 0.44), 0, 1);
    const expected = expectedScore(before, opponentAvgElo);

    const baseK = provisional ? Math.max(70, 190 - (matchNumber * 22)) : 44;
    let delta = Math.round((actual - expected) * baseK);
    if (placement === 1) delta += provisional ? 18 : 10;
    if (placement >= Math.max(2, playerCount)) delta -= provisional ? 10 : 6;

    const after = toInt(before + delta, before, 0, 50000);
    const matchesPlayed = matchNumber;
    const calibrated = matchesPlayed >= calibrationMatches;
    const tier = getPremierTierId(after, calibrated);

    return {
        before,
        after,
        delta: after - before,
        matchesPlayed,
        calibrationMatches,
        calibrated,
        tier,
    };
};

export const toPremierPublic = (premier) => {
    const safe = sanitizePremier(premier);
    const tierMeta = getPremierTierMeta(safe.rating, safe.calibrated);
    return {
        rating: safe.rating,
        matchesPlayed: safe.matchesPlayed,
        calibrationMatches: safe.calibrationMatches,
        calibrated: safe.calibrated,
        visible: safe.calibrated,
        tier: tierMeta.id,
        tierLabel: tierMeta.label,
        tierColor: tierMeta.color,
        display: safe.calibrated ? `${safe.rating}` : '?',
    };
};

export const buildPremierLeaderboard = ({
    premierStore,
    usersById,
    viewerUserId = '',
    now = new Date(),
    windowSize = PREMIER_WINDOW_SIZE,
}) => {
    const safeNow = now instanceof Date ? now : new Date();
    const season = ensurePremierSeason(premierStore, safeNow);
    const seasonMeta = getPremierSeasonMeta(season.id || safeNow);
    const ranked = Object.entries(season.players || {})
        .map(([userId, premier]) => {
            const user = usersById.get(userId);
            const cosmetics = user?.progression?.cosmetics || null;
            const current = sanitizePremier(premier);
            return {
                userId,
                username: user ? user.username : userId,
                premier: current,
                cosmetics: cosmetics
                    ? {
                        title: cosmetics.title || '',
                        nameColor: cosmetics.nameColor || 'default',
                        avatarFrame: cosmetics.avatarFrame || 'default',
                        avatar: cosmetics.avatar || 'rookie_ops',
                    }
                    : null,
            };
        })
        .filter((row) => row.premier.calibrated)
        .sort((a, b) => {
            if (b.premier.rating !== a.premier.rating) return b.premier.rating - a.premier.rating;
            if (a.premier.matchesPlayed !== b.premier.matchesPlayed) return a.premier.matchesPlayed - b.premier.matchesPlayed;
            return a.username.localeCompare(b.username, 'en', { sensitivity: 'base' });
        });

    const safeWindowSize = Math.max(1, Math.min(100, toInt(windowSize, PREMIER_WINDOW_SIZE, 1)));
    const rankedCount = ranked.length;
    const viewerRank = viewerUserId
        ? ranked.findIndex((row) => row.userId === viewerUserId) + 1
        : 0;

    let startIndex = 0;
    let windowMode = 'top50';
    if (viewerRank > 0) {
        startIndex = Math.max(0, viewerRank - 1 - PREMIER_WINDOW_ABOVE);
        windowMode = 'around-viewer';
    }
    if ((startIndex + safeWindowSize) > rankedCount) {
        startIndex = Math.max(0, rankedCount - safeWindowSize);
    }

    const rows = ranked
        .slice(startIndex, startIndex + safeWindowSize)
        .map((row, index) => ({
            rank: startIndex + index + 1,
            userId: row.userId,
            username: row.username,
            premier: toPremierPublic(row.premier),
            cosmetics: row.cosmetics,
        }));

    const nextResetMs = Number(new Date(seasonMeta.endAt).getTime()) || 0;
    const resetInSeconds = nextResetMs
        ? Math.max(0, Math.floor((nextResetMs - safeNow.getTime()) / 1000))
        : null;

    return {
        seasonId: seasonMeta.id,
        seasonLabel: season.label || seasonMeta.label,
        seasonStartAt: season.startAt || seasonMeta.startAt,
        seasonEndAt: season.endAt || seasonMeta.endAt,
        generatedAt: safeNow.toISOString(),
        serverTime: safeNow.toISOString(),
        nextResetAt: season.endAt || seasonMeta.endAt,
        resetInSeconds,
        totalPlayers: Object.keys(season.players || {}).length,
        rankedPlayers: rankedCount,
        viewerRank: viewerRank || null,
        windowMode,
        rows,
    };
};
