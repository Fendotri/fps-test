import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createNewUser } from '../backend/src/db.mjs';
import { getTodayKey, getWeekKey } from '../backend/src/leaderboard.mjs';
import { getDefaultLoadout } from '../backend/src/liveops.mjs';

const PREFIX = 'lb_dummy_';
const DEFAULT_COUNT = 24;
const DB_PATH = path.join(process.cwd(), 'backend', 'data', 'db.json');

const argValue = (name) => {
    const index = process.argv.findIndex((arg) => arg === name);
    if (index < 0) return null;
    return process.argv[index + 1] ?? null;
};

const toInt = (value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (value === null || value === undefined || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const randomInt = (min, max) => {
    if (max <= min) return min;
    const span = max - min + 1;
    return min + Math.floor(Math.random() * span);
};

const randomRecentDateIso = (maxDaysAgo = 6) => {
    const now = Date.now();
    const daysAgo = randomInt(0, maxDaysAgo);
    const extraMs = randomInt(0, 23 * 60 * 60 * 1000);
    return new Date(now - (daysAgo * 24 * 60 * 60 * 1000) - extraMs).toISOString();
};

const premierBandByIndex = (index) => {
    const bands = [
        { id: 'gray', min: 800, max: 4999 },
        { id: 'cyan', min: 5000, max: 9999 },
        { id: 'blue', min: 10000, max: 14999 },
        { id: 'purple', min: 15000, max: 19999 },
        { id: 'pink', min: 20000, max: 24999 },
        { id: 'red', min: 25000, max: 29999 },
        { id: 'gold', min: 30000, max: 36000 },
    ];
    return bands[index % bands.length];
};

const removeFromLeaderboardTable = (table, idsToRemove) => {
    if (!table || typeof table !== 'object') return;
    idsToRemove.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(table, id)) delete table[id];
    });
};

const ensureObject = (value) => (value && typeof value === 'object' ? value : {});

const countArg = toInt(argValue('--count'), DEFAULT_COUNT, 4, 100);

const raw = await fs.readFile(DB_PATH, 'utf8');
const db = JSON.parse(raw);

db.users = Array.isArray(db.users) ? db.users : [];
db.leaderboards = ensureObject(db.leaderboards);
db.leaderboards.all = ensureObject(db.leaderboards.all);
db.leaderboards.daily = ensureObject(db.leaderboards.daily);
db.leaderboards.weekly = ensureObject(db.leaderboards.weekly);

const removedUsers = db.users.filter((user) => `${user?.usernameLower || ''}`.startsWith(PREFIX));
const removedIds = removedUsers.map((user) => user.id);

db.users = db.users.filter((user) => !`${user?.usernameLower || ''}`.startsWith(PREFIX));
removeFromLeaderboardTable(db.leaderboards.all, removedIds);
Object.values(db.leaderboards.daily).forEach((table) => removeFromLeaderboardTable(table, removedIds));
Object.values(db.leaderboards.weekly).forEach((table) => removeFromLeaderboardTable(table, removedIds));

const todayKey = getTodayKey(new Date());
const weekKey = getWeekKey(new Date());
db.leaderboards.daily[todayKey] = ensureObject(db.leaderboards.daily[todayKey]);
db.leaderboards.weekly[weekKey] = ensureObject(db.leaderboards.weekly[weekKey]);

const defaultLoadout = getDefaultLoadout(db.liveops);
const created = [];

for (let i = 0; i < countArg; i += 1) {
    const username = `LB_DUMMY_${String(i + 1).padStart(2, '0')}`;
    const user = createNewUser({
        id: crypto.randomUUID(),
        username,
        passwordHash: crypto.randomBytes(64).toString('hex'),
        passwordSalt: crypto.randomBytes(16).toString('hex'),
        starterWallet: randomInt(300, 6000),
        defaultLoadout,
    });

    user.usernameLower = username.toLowerCase();

    const band = premierBandByIndex(i);
    const kills = randomInt(120, 2800);
    const deaths = randomInt(80, 2400);
    const assists = randomInt(15, 650);
    const headshots = randomInt(Math.floor(kills * 0.18), Math.floor(kills * 0.62));
    const damage = randomInt(kills * 62, kills * 110);
    const score = Math.max(
        0,
        Math.floor((kills * 120) + (assists * 62) + (damage * 0.24) - (deaths * 35) + randomInt(-600, 900)),
    );
    const wins = randomInt(5, 200);
    const matchesPlayed = randomInt(25, 750);

    user.stats = {
        kills,
        deaths,
        assists,
        headshots,
        damage,
        score,
        wins,
        matchesPlayed,
        maxKillStreak: randomInt(6, 34),
        lastMatchAt: randomRecentDateIso(5),
    };

    user.premier = {
        rating: randomInt(band.min, band.max),
        matchesPlayed: randomInt(8, 420),
        calibrationMatches: 5,
        calibrated: true,
        tier: band.id,
    };

    const allEntry = {
        kills,
        deaths,
        assists,
        damage,
        score,
        wins,
        matchesPlayed,
    };

    const dailyEntry = {
        kills: randomInt(4, Math.min(140, Math.max(4, Math.floor(kills * 0.12)))),
        deaths: randomInt(3, Math.min(120, Math.max(3, Math.floor(deaths * 0.12)))),
        assists: randomInt(0, Math.min(40, Math.max(0, Math.floor(assists * 0.15)))),
        damage: randomInt(200, Math.min(16000, Math.max(220, Math.floor(damage * 0.12)))),
        score: randomInt(400, Math.min(9000, Math.max(420, Math.floor(score * 0.14)))),
        wins: randomInt(0, Math.min(20, Math.max(0, Math.floor(wins * 0.14)))),
        matchesPlayed: randomInt(1, 18),
    };

    const weeklyEntry = {
        kills: randomInt(
            Math.max(dailyEntry.kills + 3, 10),
            Math.max(dailyEntry.kills + 3, Math.min(420, Math.max(12, Math.floor(kills * 0.35)))),
        ),
        deaths: randomInt(
            Math.max(dailyEntry.deaths + 2, 8),
            Math.max(dailyEntry.deaths + 2, Math.min(380, Math.max(9, Math.floor(deaths * 0.35)))),
        ),
        assists: randomInt(
            Math.max(dailyEntry.assists, 0),
            Math.max(dailyEntry.assists + 1, Math.min(110, Math.max(1, Math.floor(assists * 0.38)))),
        ),
        damage: randomInt(
            Math.max(dailyEntry.damage + 300, 700),
            Math.max(dailyEntry.damage + 300, Math.min(52000, Math.max(750, Math.floor(damage * 0.36)))),
        ),
        score: randomInt(
            Math.max(dailyEntry.score + 180, 900),
            Math.max(dailyEntry.score + 180, Math.min(26000, Math.max(980, Math.floor(score * 0.37)))),
        ),
        wins: randomInt(
            Math.max(dailyEntry.wins, 0),
            Math.max(dailyEntry.wins + 1, Math.min(55, Math.max(1, Math.floor(wins * 0.36)))),
        ),
        matchesPlayed: randomInt(Math.max(dailyEntry.matchesPlayed, 1), Math.max(dailyEntry.matchesPlayed + 1, 52)),
    };

    db.users.push(user);
    db.leaderboards.all[user.id] = allEntry;
    db.leaderboards.daily[todayKey][user.id] = dailyEntry;
    db.leaderboards.weekly[weekKey][user.id] = weeklyEntry;

    created.push({
        username,
        kills: allEntry.kills,
        deaths: allEntry.deaths,
        assists: allEntry.assists,
        score: allEntry.score,
        premier: user.premier.rating,
        tier: user.premier.tier,
    });
}

if (!db.meta || typeof db.meta !== 'object') db.meta = {};
db.meta.updatedAt = new Date().toISOString();

await fs.writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, 'utf8');

created.sort((a, b) => b.kills - a.kills);

console.log(
    `[seed-leaderboard-dummy] removed=${removedIds.length} created=${created.length} day=${todayKey} week=${weekKey}`,
);
console.table(created.slice(0, 12));
