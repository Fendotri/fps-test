import { getTodayKey, getWeekKey } from './leaderboard.mjs';
import { DEFAULT_AVATAR_ID, getAvatarCatalogSnapshot, sanitizeAvatarId, sanitizeAvatarIdArray } from './cosmetics.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

const toInt = (value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const ensureString = (value, fallback = '') => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
};

const ensureStringArray = (value, fallback = []) => {
    if (!Array.isArray(value)) return [...fallback];
    const output = [];
    const used = new Set();
    value.forEach((item) => {
        const parsed = ensureString(item, '');
        if (!parsed) return;
        if (used.has(parsed)) return;
        used.add(parsed);
        output.push(parsed);
    });
    return output.length ? output : [...fallback];
};

const getIsoWeekday = (date = new Date()) => {
    const day = date.getUTCDay();
    return day === 0 ? 7 : day;
};

const nextDailyReset = (now) => new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
));

const nextWeeklyReset = (now) => {
    const midnightUtc = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
    );
    const isoWeekday = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
    const daysUntilNextMonday = 8 - isoWeekday;
    return new Date(midnightUtc + (daysUntilNextMonday * 24 * 60 * 60 * 1000));
};

const createWeeklyLoginReward = (overrides = {}) => ({
    day: toInt(overrides.day, 1, 1, 7),
    title: ensureString(overrides.title, `Day ${toInt(overrides.day, 1, 1, 7)}`),
    rewardCoin: toInt(overrides.rewardCoin, 0, 0, 1000000),
});

const createQuest = (overrides = {}) => ({
    id: ensureString(overrides.id, 'quest'),
    title: ensureString(overrides.title, 'Quest'),
    description: ensureString(overrides.description, ''),
    metric: ensureString(overrides.metric, 'kills'),
    goal: toInt(overrides.goal, 1, 1, 100000),
    rewardCoin: toInt(overrides.rewardCoin, 0, 0, 1000000),
    weaponId: ensureString(overrides.weaponId, '').toLowerCase(),
});

const createAchievement = (overrides = {}) => ({
    id: ensureString(overrides.id, 'achievement'),
    title: ensureString(overrides.title, 'Achievement'),
    description: ensureString(overrides.description, ''),
    metric: ensureString(overrides.metric, 'total_kills'),
    goal: toInt(overrides.goal, 1, 1, 10000000),
    rewardTitle: ensureString(overrides.rewardTitle, ''),
    rewardNameColor: ensureString(overrides.rewardNameColor, ''),
    rewardAvatar: sanitizeAvatarId(overrides.rewardAvatar, ''),
    rewardAvatarFrame: ensureString(overrides.rewardAvatarFrame, ''),
    rewardCoin: toInt(overrides.rewardCoin, 0, 0, 1000000),
});

const DEFAULT_QUEST_CONFIG = {
    daily: [
        createQuest({
            id: 'daily_kills_15',
            title: 'Daily Hunter',
            description: 'Get 15 total kills.',
            metric: 'kills',
            goal: 15,
            rewardCoin: 140,
        }),
        createQuest({
            id: 'daily_ak47_6',
            title: 'AK Task',
            description: 'Get 6 kills with AK-47.',
            metric: 'weapon_kills',
            weaponId: 'ak47',
            goal: 6,
            rewardCoin: 160,
        }),
        createQuest({
            id: 'daily_assist_8',
            title: 'Support Player',
            description: 'Make 8 assists.',
            metric: 'assists',
            goal: 8,
            rewardCoin: 130,
        }),
    ],
    weekly: [
        createQuest({
            id: 'weekly_flawless_20',
            title: 'Flawless Round',
            description: 'Get 20 kills without dying in one match.',
            metric: 'flawless_20',
            goal: 1,
            rewardCoin: 700,
        }),
        createQuest({
            id: 'weekly_headshot_30',
            title: 'Sharpshooter',
            description: 'Hit 30 headshots total.',
            metric: 'headshots',
            goal: 30,
            rewardCoin: 520,
        }),
        createQuest({
            id: 'weekly_awp_20',
            title: 'AWP Master',
            description: 'Get 20 kills with AWP.',
            metric: 'weapon_kills',
            weaponId: 'awp',
            goal: 20,
            rewardCoin: 560,
        }),
    ],
};

const DEFAULT_ACHIEVEMENTS = [
    createAchievement({
        id: 'ach_kill_10',
        title: 'Trigger Finger I',
        description: 'Toplam 10 kill.',
        metric: 'total_kills',
        goal: 10,
        rewardTitle: 'Trigger Finger',
        rewardAvatar: 'dust_raider',
    }),
    createAchievement({
        id: 'ach_kill_100',
        title: 'Entry Fragger',
        description: 'Toplam 100 kill.',
        metric: 'total_kills',
        goal: 100,
        rewardTitle: 'Entry Fragger',
        rewardNameColor: 'cyan',
    }),
    createAchievement({
        id: 'ach_kill_1000',
        title: 'Death Dealer',
        description: 'Toplam 1000 kill.',
        metric: 'total_kills',
        goal: 1000,
        rewardTitle: 'Death Dealer',
        rewardNameColor: 'gold',
        rewardAvatarFrame: 'legend',
    }),
    createAchievement({
        id: 'ach_hs_250',
        title: 'Headhunter',
        description: 'Toplam 250 headshot.',
        metric: 'total_headshots',
        goal: 250,
        rewardTitle: 'Headhunter',
        rewardNameColor: 'red',
        rewardAvatar: 'hawk_eye',
    }),
    createAchievement({
        id: 'ach_streak_20',
        title: 'Unstoppable',
        description: 'Tek maçta 20 kill streak yap.',
        metric: 'max_killstreak',
        goal: 20,
        rewardTitle: 'Unstoppable',
        rewardAvatar: 'night_viper',
        rewardAvatarFrame: 'royal',
    }),
    createAchievement({
        id: 'ach_assist_150',
        title: 'Playmaker',
        description: 'Toplam 150 asist yap.',
        metric: 'total_assists',
        goal: 150,
        rewardTitle: 'Playmaker',
        rewardNameColor: 'emerald',
        rewardAvatarFrame: 'steel',
    }),
    createAchievement({
        id: 'ach_wins_50',
        title: 'Clutch Winner',
        description: 'Toplam 50 mac kazan.',
        metric: 'wins',
        goal: 50,
        rewardTitle: 'Clutch Winner',
        rewardAvatar: 'captain_royal',
        rewardAvatarFrame: 'neon',
    }),
    createAchievement({
        id: 'ach_score_250k',
        title: 'Premier Grinder',
        description: 'Toplam 250000 score topla.',
        metric: 'total_score',
        goal: 250000,
        rewardTitle: 'Premier Grinder',
        rewardNameColor: 'pink',
        rewardAvatar: 'premier_ace',
    }),
];

const DEFAULT_WEEKLY_LOGIN_REWARDS = [
    createWeeklyLoginReward({ day: 1, title: 'Monday', rewardCoin: 120 }),
    createWeeklyLoginReward({ day: 2, title: 'Tuesday', rewardCoin: 140 }),
    createWeeklyLoginReward({ day: 3, title: 'Wednesday', rewardCoin: 160 }),
    createWeeklyLoginReward({ day: 4, title: 'Thursday', rewardCoin: 180 }),
    createWeeklyLoginReward({ day: 5, title: 'Friday', rewardCoin: 220 }),
    createWeeklyLoginReward({ day: 6, title: 'Saturday', rewardCoin: 260 }),
    createWeeklyLoginReward({ day: 7, title: 'Sunday', rewardCoin: 320 }),
];

const DEFAULT_COSMETICS = {
    title: 'Rookie',
    nameColor: 'default',
    avatar: DEFAULT_AVATAR_ID,
    avatarFrame: 'default',
    unlockedTitles: ['Rookie'],
    unlockedNameColors: ['default'],
    unlockedAvatars: [DEFAULT_AVATAR_ID],
    unlockedAvatarFrames: ['default'],
};

const sanitizeQuestList = (input, fallback) => {
    const source = Array.isArray(input) ? input : fallback;
    const out = [];
    const used = new Set();
    source.forEach((raw, idx) => {
        const fallbackQuest = fallback[idx] || fallback[0] || createQuest();
        const quest = createQuest({
            ...fallbackQuest,
            ...(raw && typeof raw === 'object' ? raw : {}),
        });
        if (!quest.id || used.has(quest.id)) return;
        used.add(quest.id);
        out.push(quest);
    });
    return out.length ? out : clone(fallback);
};

const sanitizeAchievementList = (input, fallback) => {
    const source = Array.isArray(input) ? input : [];
    const merged = source.length ? [...source] : [...fallback];
    const known = new Set(
        merged
            .map((entry) => ensureString(entry?.id, ''))
            .filter(Boolean),
    );
    fallback.forEach((item) => {
        if (!known.has(item.id)) {
            merged.push(item);
            known.add(item.id);
        }
    });

    const out = [];
    const used = new Set();
    merged.forEach((raw, idx) => {
        const rawId = ensureString(raw?.id, '');
        const fallbackAch = fallback.find((item) => item.id === rawId) || fallback[idx] || fallback[0] || createAchievement();
        const achievement = createAchievement({
            ...fallbackAch,
            ...(raw && typeof raw === 'object' ? raw : {}),
        });
        if (!achievement.id || used.has(achievement.id)) return;
        used.add(achievement.id);
        out.push(achievement);
    });
    return out.length ? out : clone(fallback);
};

const sanitizeWeeklyLoginRewards = (input, fallback) => {
    const source = Array.isArray(input) ? input : fallback;
    const byDay = new Map();
    source.forEach((raw, idx) => {
        const fallbackItem = fallback[idx] || fallback[0] || createWeeklyLoginReward();
        const item = createWeeklyLoginReward({
            ...fallbackItem,
            ...(raw && typeof raw === 'object' ? raw : {}),
        });
        byDay.set(item.day, item);
    });

    const out = [];
    for (let day = 1; day <= 7; day += 1) {
        if (byDay.has(day)) out.push(byDay.get(day));
        else {
            const fallbackByDay = fallback.find((item) => item.day === day) || createWeeklyLoginReward({ day, title: `Day ${day}` });
            out.push(clone(fallbackByDay));
        }
    }
    return out;
};

const ensureQuestBucket = (value, key) => {
    const safe = (value && typeof value === 'object') ? value : {};
    return {
        key: ensureString(safe.key, key),
        progress: (safe.progress && typeof safe.progress === 'object') ? safe.progress : {},
        rewarded: (safe.rewarded && typeof safe.rewarded === 'object') ? safe.rewarded : {},
    };
};

const ensureWeeklyLoginBucket = (value, key) => {
    const safe = (value && typeof value === 'object') ? value : {};
    const claimedRaw = safe.claimed && typeof safe.claimed === 'object' ? safe.claimed : {};
    const claimed = {};
    Object.keys(claimedRaw).forEach((entryDay) => {
        const day = toInt(entryDay, 0, 1, 7);
        if (!day) return;
        const iso = ensureString(claimedRaw[entryDay], '');
        if (!iso) return;
        claimed[`${day}`] = iso;
    });
    return {
        key: ensureString(safe.key, key),
        claimed,
    };
};

const normalizeWeaponKills = (value) => {
    if (!value || typeof value !== 'object') return {};
    const output = {};
    Object.keys(value).forEach((weaponId) => {
        const key = ensureString(weaponId, '').toLowerCase();
        if (!key) return;
        output[key] = toInt(value[weaponId], 0, 0, 100000);
    });
    return output;
};

const getAchievementCurrentValue = (achievement, user) => {
    const stats = user?.stats || {};
    switch (achievement.metric) {
        case 'total_headshots':
            return toInt(stats.headshots, 0, 0, 100000000);
        case 'total_assists':
            return toInt(stats.assists, 0, 0, 100000000);
        case 'max_killstreak':
            return toInt(stats.maxKillStreak, 0, 0, 1000000);
        case 'total_score':
            return toInt(stats.score, 0, 0, 1000000000);
        case 'wins':
            return toInt(stats.wins, 0, 0, 100000000);
        case 'total_kills':
        default:
            return toInt(stats.kills, 0, 0, 100000000);
    }
};

const getQuestContribution = (quest, payload) => {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const weaponKills = normalizeWeaponKills(safePayload.weaponKills);
    const kills = toInt(safePayload.kills, 0, 0, 100000);
    const assists = toInt(safePayload.assists, 0, 0, 100000);
    const headshots = toInt(safePayload.headshots, 0, 0, 100000);
    const deaths = toInt(safePayload.deaths, 0, 0, 100000);
    const maxKillStreak = toInt(safePayload.maxKillStreak, 0, 0, 100000);

    switch (quest.metric) {
        case 'assists':
            return assists;
        case 'headshots':
            return headshots;
        case 'weapon_kills':
            return toInt(weaponKills[quest.weaponId], 0, 0, 100000);
        case 'flawless_20':
            return maxKillStreak >= 20 && deaths === 0 ? 1 : 0;
        case 'kills':
        default:
            return kills;
    }
};

export const createDefaultProgressionConfig = () => ({
    quests: clone(DEFAULT_QUEST_CONFIG),
    achievements: clone(DEFAULT_ACHIEVEMENTS),
    weeklyLoginRewards: clone(DEFAULT_WEEKLY_LOGIN_REWARDS),
});

export const normalizeProgressionConfig = (raw) => {
    const fallback = createDefaultProgressionConfig();
    const safe = raw && typeof raw === 'object' ? raw : {};
    const questsRaw = safe.quests && typeof safe.quests === 'object' ? safe.quests : {};

    return {
        quests: {
            daily: sanitizeQuestList(questsRaw.daily, fallback.quests.daily),
            weekly: sanitizeQuestList(questsRaw.weekly, fallback.quests.weekly),
        },
        achievements: sanitizeAchievementList(safe.achievements, fallback.achievements),
        weeklyLoginRewards: sanitizeWeeklyLoginRewards(safe.weeklyLoginRewards, fallback.weeklyLoginRewards),
    };
};

export const getProgressionConfig = (liveops) => {
    const raw = liveops?.progression;
    return normalizeProgressionConfig(raw);
};

export const createDefaultUserProgression = (now = new Date()) => ({
    quests: {
        daily: {
            key: getTodayKey(now),
            progress: {},
            rewarded: {},
        },
        weekly: {
            key: getWeekKey(now),
            progress: {},
            rewarded: {},
        },
    },
    achievements: {
        unlocked: {},
    },
    weeklyLogin: {
        key: getWeekKey(now),
        claimed: {},
    },
    cosmetics: clone(DEFAULT_COSMETICS),
});

export const sanitizeUserProgression = (user, liveops, now = new Date()) => {
    const fallback = createDefaultUserProgression(now);
    const cfg = getProgressionConfig(liveops);

    if (!user.progression || typeof user.progression !== 'object') {
        user.progression = clone(fallback);
    }

    const quests = user.progression.quests && typeof user.progression.quests === 'object'
        ? user.progression.quests
        : fallback.quests;

    const todayKey = getTodayKey(now);
    const weekKey = getWeekKey(now);
    const daily = ensureQuestBucket(quests.daily, todayKey);
    const weekly = ensureQuestBucket(quests.weekly, weekKey);
    const weeklyLogin = ensureWeeklyLoginBucket(user.progression.weeklyLogin, weekKey);

    if (daily.key !== todayKey) {
        daily.key = todayKey;
        daily.progress = {};
        daily.rewarded = {};
    }
    if (weekly.key !== weekKey) {
        weekly.key = weekKey;
        weekly.progress = {};
        weekly.rewarded = {};
    }
    if (weeklyLogin.key !== weekKey) {
        weeklyLogin.key = weekKey;
        weeklyLogin.claimed = {};
    }

    user.progression.quests = { daily, weekly };
    user.progression.weeklyLogin = weeklyLogin;

    if (!user.progression.achievements || typeof user.progression.achievements !== 'object') {
        user.progression.achievements = { unlocked: {} };
    }
    if (!user.progression.achievements.unlocked || typeof user.progression.achievements.unlocked !== 'object') {
        user.progression.achievements.unlocked = {};
    }

    const cosmetics = user.progression.cosmetics && typeof user.progression.cosmetics === 'object'
        ? user.progression.cosmetics
        : clone(DEFAULT_COSMETICS);

    const unlockedTitles = ensureStringArray(cosmetics.unlockedTitles, DEFAULT_COSMETICS.unlockedTitles);
    const unlockedNameColors = ensureStringArray(cosmetics.unlockedNameColors, DEFAULT_COSMETICS.unlockedNameColors);
    const unlockedAvatars = sanitizeAvatarIdArray(cosmetics.unlockedAvatars, DEFAULT_COSMETICS.unlockedAvatars);
    const unlockedAvatarFrames = ensureStringArray(cosmetics.unlockedAvatarFrames, DEFAULT_COSMETICS.unlockedAvatarFrames);

    if (!unlockedTitles.includes(DEFAULT_COSMETICS.title)) unlockedTitles.unshift(DEFAULT_COSMETICS.title);
    if (!unlockedNameColors.includes(DEFAULT_COSMETICS.nameColor)) unlockedNameColors.unshift(DEFAULT_COSMETICS.nameColor);
    if (!unlockedAvatars.includes(DEFAULT_COSMETICS.avatar)) unlockedAvatars.unshift(DEFAULT_COSMETICS.avatar);
    if (!unlockedAvatarFrames.includes(DEFAULT_COSMETICS.avatarFrame)) unlockedAvatarFrames.unshift(DEFAULT_COSMETICS.avatarFrame);

    let title = ensureString(cosmetics.title, DEFAULT_COSMETICS.title);
    let nameColor = ensureString(cosmetics.nameColor, DEFAULT_COSMETICS.nameColor);
    let avatar = sanitizeAvatarId(cosmetics.avatar, DEFAULT_COSMETICS.avatar);
    let avatarFrame = ensureString(cosmetics.avatarFrame, DEFAULT_COSMETICS.avatarFrame);

    if (!unlockedTitles.includes(title)) title = unlockedTitles[0];
    if (!unlockedNameColors.includes(nameColor)) nameColor = unlockedNameColors[0];
    if (!unlockedAvatars.includes(avatar)) avatar = unlockedAvatars[0];
    if (!unlockedAvatarFrames.includes(avatarFrame)) avatarFrame = unlockedAvatarFrames[0];

    user.progression.cosmetics = {
        title,
        nameColor,
        avatar,
        avatarFrame,
        unlockedTitles,
        unlockedNameColors,
        unlockedAvatars,
        unlockedAvatarFrames,
    };

    // Guarantee known ids exist in buckets for deterministic UI ordering.
    ['daily', 'weekly'].forEach((scope) => {
        const defs = cfg.quests[scope] || [];
        const bucket = user.progression.quests[scope];
        defs.forEach((quest) => {
            if (!Object.prototype.hasOwnProperty.call(bucket.progress, quest.id)) bucket.progress[quest.id] = 0;
            if (!Object.prototype.hasOwnProperty.call(bucket.rewarded, quest.id)) bucket.rewarded[quest.id] = false;
        });
    });
};

const buildQuestScopeSnapshot = (scope, defs, bucket, now) => {
    const safeNow = now instanceof Date ? now : new Date();
    const nextResetDate = scope === 'daily' ? nextDailyReset(safeNow) : nextWeeklyReset(safeNow);
    const nextResetAt = nextResetDate.toISOString();
    const resetInSeconds = Math.max(0, Math.floor((nextResetDate.getTime() - safeNow.getTime()) / 1000));

    const items = defs.map((quest) => {
        const progress = toInt(bucket?.progress?.[quest.id], 0, 0, 1000000);
        const goal = toInt(quest.goal, 1, 1, 1000000);
        const rewarded = !!bucket?.rewarded?.[quest.id];
        const completed = progress >= goal;

        return {
            id: quest.id,
            title: quest.title,
            description: quest.description,
            metric: quest.metric,
            weaponId: quest.weaponId || '',
            progress: Math.min(progress, goal),
            goal,
            remaining: Math.max(0, goal - progress),
            completed,
            rewarded,
            rewardCoin: toInt(quest.rewardCoin, 0, 0, 1000000),
        };
    });

    return {
        key: ensureString(bucket?.key, scope === 'daily' ? getTodayKey(safeNow) : getWeekKey(safeNow)),
        nextResetAt,
        resetInSeconds,
        items,
    };
};

const buildWeeklyLoginSnapshot = (defs, bucket, now) => {
    const safeNow = now instanceof Date ? now : new Date();
    const todayDay = getIsoWeekday(safeNow);
    const nextResetDate = nextWeeklyReset(safeNow);
    const nextResetAt = nextResetDate.toISOString();
    const resetInSeconds = Math.max(0, Math.floor((nextResetDate.getTime() - safeNow.getTime()) / 1000));
    const claimedMap = (bucket && typeof bucket.claimed === 'object') ? bucket.claimed : {};

    const items = defs.map((reward) => {
        const day = toInt(reward.day, 1, 1, 7);
        const claimedAt = ensureString(claimedMap[`${day}`], '') || null;
        const claimed = !!claimedAt;
        const claimable = day === todayDay && !claimed;
        const missed = day < todayDay && !claimed;
        return {
            day,
            title: reward.title,
            rewardCoin: toInt(reward.rewardCoin, 0, 0, 1000000),
            claimed,
            claimedAt,
            claimable,
            missed,
        };
    });

    return {
        key: ensureString(bucket?.key, getWeekKey(safeNow)),
        nextResetAt,
        resetInSeconds,
        todayDay,
        claimableCount: items.filter((item) => item.claimable).length,
        items,
    };
};

const buildAchievementsSnapshot = (defs, user) => {
    const unlocked = user?.progression?.achievements?.unlocked || {};
    const items = defs.map((achievement) => {
        const current = getAchievementCurrentValue(achievement, user);
        const goal = toInt(achievement.goal, 1, 1, 1000000000);
        const unlockedAt = ensureString(unlocked[achievement.id], '');
        const isUnlocked = !!unlockedAt || current >= goal;

        return {
            id: achievement.id,
            title: achievement.title,
            description: achievement.description,
            metric: achievement.metric,
            current: Math.min(current, goal),
            goal,
            completed: current >= goal,
            unlocked: isUnlocked,
            unlockedAt: unlockedAt || null,
            rewardTitle: achievement.rewardTitle || '',
            rewardNameColor: achievement.rewardNameColor || '',
            rewardAvatar: achievement.rewardAvatar || '',
            rewardAvatarFrame: achievement.rewardAvatarFrame || '',
            rewardCoin: toInt(achievement.rewardCoin, 0, 0, 1000000),
        };
    });

    return {
        unlockedCount: items.filter((item) => item.unlocked).length,
        total: items.length,
        items,
    };
};

export const buildProgressionSnapshot = ({ user, liveops, now = new Date() }) => {
    sanitizeUserProgression(user, liveops, now);
    const cfg = getProgressionConfig(liveops);
    const safeNow = now instanceof Date ? now : new Date();

    return {
        serverTime: safeNow.toISOString(),
        quests: {
            daily: buildQuestScopeSnapshot('daily', cfg.quests.daily, user.progression.quests.daily, safeNow),
            weekly: buildQuestScopeSnapshot('weekly', cfg.quests.weekly, user.progression.quests.weekly, safeNow),
        },
        weeklyLogin: buildWeeklyLoginSnapshot(cfg.weeklyLoginRewards, user.progression.weeklyLogin, safeNow),
        achievements: buildAchievementsSnapshot(cfg.achievements, user),
        cosmetics: {
            ...clone(user.progression.cosmetics),
            avatarCatalog: getAvatarCatalogSnapshot(),
        },
    };
};

export const claimWeeklyLoginReward = ({ user, liveops, now = new Date() }) => {
    const safeNow = now instanceof Date ? now : new Date();
    sanitizeUserProgression(user, liveops, safeNow);
    const cfg = getProgressionConfig(liveops);
    const bucket = user.progression.weeklyLogin;
    const todayDay = getIsoWeekday(safeNow);
    const dayKey = `${todayDay}`;

    if (ensureString(bucket.claimed?.[dayKey], '')) {
        return {
            ok: false,
            reason: 'already-claimed',
            rewardCoin: 0,
            claimedDay: todayDay,
            snapshot: buildProgressionSnapshot({ user, liveops, now: safeNow }),
        };
    }

    const rewardDef = (cfg.weeklyLoginRewards || []).find((item) => toInt(item.day, 0, 1, 7) === todayDay);
    if (!rewardDef) {
        return {
            ok: false,
            reason: 'no-reward-defined',
            rewardCoin: 0,
            claimedDay: todayDay,
            snapshot: buildProgressionSnapshot({ user, liveops, now: safeNow }),
        };
    }

    const rewardCoin = toInt(rewardDef.rewardCoin, 0, 0, 1000000);
    bucket.claimed[dayKey] = safeNow.toISOString();
    if (rewardCoin > 0) {
        user.wallet = toInt(user.wallet, 0, 0, 1000000000) + rewardCoin;
    }

    sanitizeUserProgression(user, liveops, safeNow);
    return {
        ok: true,
        reason: 'claimed',
        rewardCoin,
        claimedDay: todayDay,
        snapshot: buildProgressionSnapshot({ user, liveops, now: safeNow }),
    };
};

export const applyProgressionFromMatch = ({ user, liveops, payload, now = new Date() }) => {
    sanitizeUserProgression(user, liveops, now);
    const cfg = getProgressionConfig(liveops);
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const safeNow = now instanceof Date ? now : new Date();
    const nowIso = safeNow.toISOString();

    let questRewardTotal = 0;
    const questCompletions = [];
    const achievementUnlocks = [];

    ['daily', 'weekly'].forEach((scope) => {
        const defs = cfg.quests[scope] || [];
        const bucket = user.progression.quests[scope];
        defs.forEach((quest) => {
            const prev = toInt(bucket.progress[quest.id], 0, 0, 10000000);
            const gain = getQuestContribution(quest, safePayload);
            const next = toInt(prev + gain, prev, 0, 10000000);
            bucket.progress[quest.id] = next;

            const completed = next >= quest.goal;
            const rewarded = !!bucket.rewarded[quest.id];
            if (completed && !rewarded) {
                bucket.rewarded[quest.id] = true;
                const rewardCoin = toInt(quest.rewardCoin, 0, 0, 1000000);
                if (rewardCoin > 0) {
                    user.wallet = toInt(user.wallet, 0, 0, 1000000000) + rewardCoin;
                    questRewardTotal += rewardCoin;
                }
                questCompletions.push({
                    scope,
                    id: quest.id,
                    title: quest.title,
                    rewardCoin,
                });
            }
        });
    });

    const unlocked = user.progression.achievements.unlocked;
    cfg.achievements.forEach((achievement) => {
        const current = getAchievementCurrentValue(achievement, user);
        if (current < achievement.goal) return;
        if (ensureString(unlocked[achievement.id], '')) return;

        unlocked[achievement.id] = nowIso;
        const rewardCoin = toInt(achievement.rewardCoin, 0, 0, 1000000);
        if (rewardCoin > 0) {
            user.wallet = toInt(user.wallet, 0, 0, 1000000000) + rewardCoin;
        }

        const cosmetics = user.progression.cosmetics;
        if (achievement.rewardTitle && !cosmetics.unlockedTitles.includes(achievement.rewardTitle)) {
            cosmetics.unlockedTitles.push(achievement.rewardTitle);
        }
        if (achievement.rewardNameColor && !cosmetics.unlockedNameColors.includes(achievement.rewardNameColor)) {
            cosmetics.unlockedNameColors.push(achievement.rewardNameColor);
        }
        if (achievement.rewardAvatar && !cosmetics.unlockedAvatars.includes(achievement.rewardAvatar)) {
            cosmetics.unlockedAvatars.push(achievement.rewardAvatar);
        }
        if (achievement.rewardAvatarFrame && !cosmetics.unlockedAvatarFrames.includes(achievement.rewardAvatarFrame)) {
            cosmetics.unlockedAvatarFrames.push(achievement.rewardAvatarFrame);
        }

        achievementUnlocks.push({
            id: achievement.id,
            title: achievement.title,
            rewardTitle: achievement.rewardTitle || '',
            rewardNameColor: achievement.rewardNameColor || '',
            rewardAvatar: achievement.rewardAvatar || '',
            rewardAvatarFrame: achievement.rewardAvatarFrame || '',
            rewardCoin,
        });
    });

    sanitizeUserProgression(user, liveops, safeNow);
    const snapshot = buildProgressionSnapshot({ user, liveops, now: safeNow });

    return {
        questRewardTotal,
        questCompletions,
        achievementUnlocks,
        snapshot,
    };
};

export const equipProgressionCosmetic = (user, type, value, liveops) => {
    sanitizeUserProgression(user, liveops, new Date());
    const cosmeticType = ensureString(type, '');
    const selected = ensureString(value, '');
    if (!selected) return false;

    const cosmetics = user.progression.cosmetics;
    if (cosmeticType === 'title') {
        if (!cosmetics.unlockedTitles.includes(selected)) return false;
        cosmetics.title = selected;
        return true;
    }
    if (cosmeticType === 'nameColor') {
        if (!cosmetics.unlockedNameColors.includes(selected)) return false;
        cosmetics.nameColor = selected;
        return true;
    }
    if (cosmeticType === 'avatar') {
        const safeAvatar = sanitizeAvatarId(selected, '');
        if (!safeAvatar) return false;
        if (!cosmetics.unlockedAvatars.includes(safeAvatar)) return false;
        cosmetics.avatar = safeAvatar;
        return true;
    }
    if (cosmeticType === 'avatarFrame') {
        if (!cosmetics.unlockedAvatarFrames.includes(selected)) return false;
        cosmetics.avatarFrame = selected;
        return true;
    }
    return false;
};
