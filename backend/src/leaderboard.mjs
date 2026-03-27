import { resolveCurrentPremierProfile } from './premier.mjs';

const ensureEntry = (table, userId) => {
    if (!table[userId]) {
        table[userId] = { kills: 0, deaths: 0, assists: 0, damage: 0, score: 0, wins: 0, matchesPlayed: 0 };
    }
    return table[userId];
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export const getTodayKey = (date = new Date()) => {
    const year = date.getUTCFullYear();
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const getWeekKey = (date = new Date()) => {
    const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
    const start = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((utcDate.getTime() - start.getTime()) / 86400000) + 1) / 7);
    return `${utcDate.getUTCFullYear()}-W${`${week}`.padStart(2, '0')}`;
};

export const applyFfaProgress = (data, userId, progress, date = new Date()) => {
    const kills = Math.max(0, Number(progress.kills) || 0);
    const deaths = Math.max(0, Number(progress.deaths) || 0);
    const assists = Math.max(0, Number(progress.assists) || 0);
    const damage = Math.max(0, Number(progress.damage) || 0);
    const score = Math.max(0, Number(progress.score) || 0);
    const wins = Math.max(0, Number(progress.wins) || 0);
    const matchesPlayed = Math.max(0, Number(progress.matchesPlayed) || 0);

    const allEntry = ensureEntry(data.leaderboards.all, userId);
    allEntry.kills += kills;
    allEntry.deaths += deaths;
    allEntry.assists += assists;
    allEntry.damage += damage;
    allEntry.score += score;
    allEntry.wins += wins;
    allEntry.matchesPlayed += matchesPlayed;

    const dailyKey = getTodayKey(date);
    if (!data.leaderboards.daily[dailyKey]) data.leaderboards.daily[dailyKey] = {};
    const dailyEntry = ensureEntry(data.leaderboards.daily[dailyKey], userId);
    dailyEntry.kills += kills;
    dailyEntry.deaths += deaths;
    dailyEntry.assists += assists;
    dailyEntry.damage += damage;
    dailyEntry.score += score;
    dailyEntry.wins += wins;
    dailyEntry.matchesPlayed += matchesPlayed;

    const weeklyKey = getWeekKey(date);
    if (!data.leaderboards.weekly[weeklyKey]) data.leaderboards.weekly[weeklyKey] = {};
    const weeklyEntry = ensureEntry(data.leaderboards.weekly[weeklyKey], userId);
    weeklyEntry.kills += kills;
    weeklyEntry.deaths += deaths;
    weeklyEntry.assists += assists;
    weeklyEntry.damage += damage;
    weeklyEntry.score += score;
    weeklyEntry.wins += wins;
    weeklyEntry.matchesPlayed += matchesPlayed;
};

const buildResetMeta = (period, now) => {
    const safeNow = now instanceof Date ? now : new Date();
    if (period === 'all') {
        return {
            nextResetAt: null,
            resetInSeconds: null,
        };
    }

    if (period === 'daily') {
        const next = new Date(Date.UTC(
            safeNow.getUTCFullYear(),
            safeNow.getUTCMonth(),
            safeNow.getUTCDate() + 1,
            0,
            0,
            0,
            0,
        ));
        return {
            nextResetAt: next.toISOString(),
            resetInSeconds: Math.max(0, Math.floor((next.getTime() - safeNow.getTime()) / 1000)),
        };
    }

    const midnightUtc = Date.UTC(
        safeNow.getUTCFullYear(),
        safeNow.getUTCMonth(),
        safeNow.getUTCDate(),
        0,
        0,
        0,
        0,
    );
    const isoWeekday = safeNow.getUTCDay() === 0 ? 7 : safeNow.getUTCDay();
    const daysUntilNextMonday = 8 - isoWeekday;
    const nextMonday = new Date(midnightUtc + (daysUntilNextMonday * ONE_DAY_MS));

    return {
        nextResetAt: nextMonday.toISOString(),
        resetInSeconds: Math.max(0, Math.floor((nextMonday.getTime() - safeNow.getTime()) / 1000)),
    };
};

export const buildLeaderboard = ({ data, usersById, period = 'all', metric = 'kills', limit = 20, now = new Date() }) => {
    const safeMetric = metric === 'wins' ? 'wins' : 'kills';
    const safePeriod = ['daily', 'weekly', 'all'].includes(period) ? period : 'all';
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    let table = data.leaderboards.all || {};
    if (safePeriod === 'daily') table = data.leaderboards.daily[getTodayKey(now)] || {};
    if (safePeriod === 'weekly') table = data.leaderboards.weekly[getWeekKey(now)] || {};

    const rows = Object.entries(table).map(([userId, value]) => {
        const user = usersById.get(userId);
        const cosmetics = user?.progression?.cosmetics || null;
        const premier = user
            ? resolveCurrentPremierProfile({ user, premierStore: data.premier, now })
            : undefined;
        return {
            userId,
            username: user ? user.username : userId,
            kills: Number(value.kills) || 0,
            deaths: Number(value.deaths) || 0,
            assists: Number(value.assists) || 0,
            damage: Number(value.damage) || 0,
            score: Number(value.score) || 0,
            wins: Number(value.wins) || 0,
            matchesPlayed: Number(value.matchesPlayed) || 0,
            premier,
            cosmetics: cosmetics
                ? {
                    title: cosmetics.title || '',
                    nameColor: cosmetics.nameColor || 'default',
                    avatarFrame: cosmetics.avatarFrame || 'default',
                    avatar: cosmetics.avatar || 'rookie_ops',
                }
                : null,
        };
    });

    rows.sort((a, b) => {
        const primary = (b[safeMetric] || 0) - (a[safeMetric] || 0);
        if (primary !== 0) return primary;
        if (b.score !== a.score) return b.score - a.score;
        if (b.assists !== a.assists) return b.assists - a.assists;
        if (b.kills !== a.kills) return b.kills - a.kills;
        return a.deaths - b.deaths;
    });

    const resetMeta = buildResetMeta(safePeriod, now);

    return {
        period: safePeriod,
        metric: safeMetric,
        generatedAt: now.toISOString(),
        serverTime: now.toISOString(),
        nextResetAt: resetMeta.nextResetAt,
        resetInSeconds: resetMeta.resetInSeconds,
        rows: rows.slice(0, safeLimit).map((row, index) => ({
            rank: index + 1,
            userId: row.userId,
            username: row.username,
            kills: row.kills,
            deaths: row.deaths,
            assists: row.assists,
            damage: row.damage,
            score: row.score,
            wins: row.wins,
            matchesPlayed: row.matchesPlayed,
            premier: row.premier || null,
            cosmetics: row.cosmetics || null,
        })),
    };
};
