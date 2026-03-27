import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const argv = process.argv.slice(2);

const readArg = (name) => {
    const key = `--${name}`;
    const inline = argv.find((item) => item.startsWith(`${key}=`));
    if (inline) return inline.substring(key.length + 1).trim();
    const index = argv.findIndex((item) => item === key);
    if (index >= 0 && index + 1 < argv.length) return `${argv[index + 1] || ''}`.trim();
    return '';
};

const hasFlag = (name) => argv.includes(`--${name}`);
const toWeaponId = (value) => `${value || ''}`.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

const strictReference = hasFlag('no-strict-reference') ? false : true;
const strictFlagExplicit = hasFlag('strict-reference');
const weaponFilterRaw = readArg('weapons');
const referencePathArg = readArg('reference');
const weaponFilter = weaponFilterRaw
    ? weaponFilterRaw.split(',').map((item) => toWeaponId(item)).filter(Boolean)
    : [];

const projectRoot = process.cwd();
const combatSourcePath = path.join(projectRoot, 'src/gameplay/combat/CombatTuning.ts');
const sprayPatternPath = path.join(projectRoot, 'src/gameplay/combat/sprayPattern.fromGif.csgo128.json');
const referencePath = referencePathArg
    ? path.resolve(projectRoot, referencePathArg)
    : path.join(projectRoot, 'src/gameplay/combat/sprayReference.csgo128.json');
const tempDir = path.join(projectRoot, '.tmp-tests');
const tempModulePath = path.join(tempDir, 'CombatTuning.spray.eval.mjs');

const source = await fs.readFile(combatSourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
    fileName: 'CombatTuning.ts',
}).outputText;

const enumShim = `const GameObjectMaterialEnum = {
    PlayerHead: 0,
    PlayerChest: 1,
    PlayerUpperLimb: 2,
    PlayerLowerLimb: 3,
    PlayerBelly: 4,
};`;

const sprayPatternRaw = await fs.readFile(sprayPatternPath, 'utf8');
const sprayPatternShim = `const sprayPatternFromGifJson = ${sprayPatternRaw};`;

const patched = transpiled
    .replace(
        /import\s+sprayPatternFromGifJson\s+from\s+['"]\.\/sprayPattern\.fromGif\.csgo128\.json['"];/,
        sprayPatternShim,
    )
    .replace(
        "import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';",
        enumShim,
    );

await fs.mkdir(tempDir, { recursive: true });
await fs.writeFile(tempModulePath, patched, 'utf8');

const mod = await import(pathToFileURL(tempModulePath).href);
const { computeShot, recoverRecoil, resolveCombatProfile, seedFromWeapon } = mod;

const referenceRaw = JSON.parse(await fs.readFile(referencePath, 'utf8'));
const referencePatterns = referenceRaw.patterns || {};
const referenceName = referenceRaw.reference || 'csgo-128';
const referenceSourceType = `${referenceRaw.referenceSourceType || 'unknown'}`.trim().toLowerCase();
const referenceVersion = `${referenceRaw.referenceVersion || 'unversioned'}`;
const referenceUpdatedAt = `${referenceRaw.updatedAt || ''}`;
const hasRequiredMetadata = !!(referenceRaw.referenceSourceType && referenceRaw.referenceVersion && referenceRaw.updatedAt);

const WEAPONS = [
    'glock18',
    'usp_s',
    'deagle',
    'mac10',
    'mp9',
    'p90',
    'ak47',
    'm4a1_s',
    'sg553',
    'aug',
    'awp',
    'xm1014',
    'negev',
];

const availableWeaponSet = new Set(WEAPONS);
const unknownFilter = weaponFilter.filter((weaponId) => !availableWeaponSet.has(weaponId));
if (unknownFilter.length) {
    console.error(`Unknown weapon ids in --weapons: ${unknownFilter.join(', ')}`);
    process.exitCode = 1;
    await fs.rm(tempDir, { recursive: true, force: true });
    process.exit(1);
}

const selectedWeapons = weaponFilter.length ? weaponFilter : WEAPONS;

const SCOPED = new Set(['aug', 'sg553', 'awp']);
const DISTANCES = [10, 20];
const SPRAY_SEED_TAG = 'spray-csgo128';
const WEAPON_RUNTIME = {
    glock18: 20,
    usp_s: 12,
    deagle: 7,
    mac10: 30,
    mp9: 30,
    p90: 50,
    ak47: 30,
    m4a1_s: 25,
    sg553: 30,
    aug: 30,
    awp: 10,
    xm1014: 7,
    negev: 150,
};
const WEAPON_ACCURACY = {
    glock18: { recoilControl: 5, accurateRange: 110 },
    usp_s: { recoilControl: 5, accurateRange: 120 },
    deagle: { recoilControl: 3, accurateRange: 150 },
    mac10: { recoilControl: 5, accurateRange: 105 },
    mp9: { recoilControl: 5, accurateRange: 110 },
    p90: { recoilControl: 5, accurateRange: 120 },
    ak47: { recoilControl: 4, accurateRange: 120 },
    m4a1_s: { recoilControl: 4, accurateRange: 122 },
    sg553: { recoilControl: 4, accurateRange: 132 },
    aug: { recoilControl: 4, accurateRange: 128 },
    awp: { recoilControl: 2, accurateRange: 520 },
    xm1014: { recoilControl: 3, accurateRange: 52 },
    negev: { recoilControl: 3, accurateRange: 150 },
};

const stand = {
    onFloor: true,
    crouching: false,
    walking: false,
    horizontalSpeed: 0,
    verticalSpeed: 0,
    speed01: 0,
    landingImpact: 0,
    airborneTime: 0,
};

const normalize = (points) => {
    if (!points.length) return [];
    const [first] = points;
    return points.map((p, idx) => ({
        shotIndex: idx + 1,
        x: p.x - first.x,
        y: p.y - first.y,
    }));
};

const simulate = (weaponId, state, distance, shots) => {
    const seed = seedFromWeapon(weaponId, SPRAY_SEED_TAG);
    const profile = resolveCombatProfile(weaponId);
    const scoped = state === 'scoped';
    const fireRate = Math.max(0.04, 60 / Math.max(1, Number(profile.rpm) || 600));
    const recoilControl = Math.max(1, Number(WEAPON_ACCURACY[weaponId]?.recoilControl) || 4);
    const accurateRange = Math.max(2, Number(WEAPON_ACCURACY[weaponId]?.accurateRange) || 120);

    let recoilIndex = 0;
    let recoverLine = 0;
    let timeSinceLastShotSeconds = 999;

    const points = [];
    for (let i = 0; i < shots; i++) {
        const shot = computeShot({
            profileOrName: profile,
            movement: stand,
            recoilIndex,
            recoverLine,
            weaponSeed: seed,
            shotCounter: i,
            recoilControl,
            accurateRange,
            timeSinceLastShotSeconds,
            scoped,
        });

        points.push({
            x: shot.spreadX * distance * 26,
            y: -shot.spreadY * distance * 26,
        });

        recoilIndex = shot.nextRecoilIndex;
        recoverLine = shot.nextRecoverLine;

        const recovered = recoverRecoil({
            profileOrName: profile,
            deltaTime: fireRate,
            triggerDown: true,
            recoilIndex,
            recoverLine,
            pitchDebt: 0,
            yawDebt: 0,
        });
        recoilIndex = recovered.nextRecoilIndex;
        recoverLine = recovered.nextRecoverLine;
        timeSinceLastShotSeconds = fireRate;
    }

    return normalize(points);
};

const getReference = (weaponId, state, distance, shots) => {
    const raw = referencePatterns?.[weaponId]?.[state]?.[`${distance}`];
    if (Array.isArray(raw) && raw.length) {
        return normalize(raw.map((p) => ({ x: Number(p?.x) || 0, y: Number(p?.y) || 0 }))).slice(0, shots);
    }
    return null;
};

const rmse = (values) => {
    if (!values.length) return 0;
    const s = values.reduce((acc, v) => acc + (v * v), 0);
    return Math.sqrt(s / values.length);
};

const compare = (weaponId, state, distance, current, reference) => {
    const cls = `${resolveCombatProfile(weaponId).classification || ''}`.toLowerCase();
    const sampleCount = Math.min(current.length, reference.length);
    const deltas = [];

    const distanceNorm = Math.max(0.5, Number(distance) / 10);
    for (let i = 0; i < sampleCount; i++) {
        const dx = (current[i].x - reference[i].x) / distanceNorm;
        const dy = (current[i].y - reference[i].y) / distanceNorm;
        deltas.push(Math.hypot(dx, dy));
    }

    const rmseFirst10 = rmse(deltas.slice(0, Math.min(10, deltas.length)));
    const rmseFirst30 = rmse(deltas.slice(0, Math.min(30, deltas.length)));
    const rmseAll = rmse(deltas);
    const maxError = deltas.length ? Math.max(...deltas) : 0;

    let thresholds;
    if (cls === 'machinegun') thresholds = { rmseFirst30: 3.5, rmseAll: 7.5, max: 12 };
    else if (cls === 'sniper') thresholds = { rmseAll: 2.5, max: 5.5 };
    else if (cls === 'shotgun') thresholds = { rmseAll: 6.5, max: 12 };
    else thresholds = { rmseFirst10: 2.0, rmseAll: 4.0, max: 9.0 };

    const pass =
        (thresholds.rmseFirst10 === undefined || rmseFirst10 <= thresholds.rmseFirst10)
        && (thresholds.rmseFirst30 === undefined || rmseFirst30 <= thresholds.rmseFirst30)
        && rmseAll <= thresholds.rmseAll
        && maxError <= thresholds.max;

    return {
        weaponId,
        state,
        distance,
        classification: cls,
        sampleCount,
        rmseFirst10,
        rmseFirst30,
        rmseAll,
        maxError,
        pass,
        thresholds,
    };
};

let referenceGateReason = '';
if (strictReference) {
    if (!hasRequiredMetadata) {
        referenceGateReason = 'missing-reference-metadata';
    } else if (referenceSourceType !== 'external') {
        referenceGateReason = `reference-source-not-external (${referenceSourceType})`;
    }
}

const rows = [];
for (const weaponId of selectedWeapons) {
    const states = ['unscoped'];
    if (SCOPED.has(weaponId)) states.push('scoped');

    for (const state of states) {
        for (const distance of DISTANCES) {
            const shots = Math.max(1, WEAPON_RUNTIME[weaponId] || 30);
            const classification = `${resolveCombatProfile(weaponId).classification || ''}`.toLowerCase();

            if (referenceGateReason) {
                rows.push({
                    weaponId,
                    state,
                    distance,
                    classification,
                    sampleCount: 0,
                    rmseFirst10: 999,
                    rmseFirst30: 999,
                    rmseAll: 999,
                    maxError: 999,
                    pass: false,
                    thresholds: {},
                    invalid: true,
                    invalidReason: referenceGateReason,
                });
                continue;
            }

            const current = simulate(weaponId, state, distance, shots);
            const reference = getReference(weaponId, state, distance, shots);
            if (!reference || reference.length < shots) {
                rows.push({
                    weaponId,
                    state,
                    distance,
                    classification,
                    sampleCount: 0,
                    rmseFirst10: 999,
                    rmseFirst30: 999,
                    rmseAll: 999,
                    maxError: 999,
                    pass: false,
                    thresholds: {},
                    invalid: true,
                    invalidReason: !reference ? 'missing-reference' : `reference-too-short-${reference.length}/${shots}`,
                });
                continue;
            }
            rows.push({
                ...compare(weaponId, state, distance, current, reference),
                invalid: false,
                invalidReason: '',
            });
        }
    }
}

const summaryRows = rows.map((row) => ({
    weapon: row.weaponId,
    state: row.state,
    distance: `${row.distance}m`,
    rmse10: row.rmseFirst10.toFixed(3),
    rmse30: row.rmseFirst30.toFixed(3),
    rmseAll: row.rmseAll.toFixed(3),
    max: row.maxError.toFixed(3),
    pass: row.pass,
    invalid: row.invalid,
    reason: row.invalidReason,
}));

console.table(summaryRows);
const passCount = rows.filter((row) => row.pass).length;
console.log(`\nSpray matrix complete: ${passCount}/${rows.length} PASS | reference=${referenceName} (${referenceSourceType} @ ${referenceVersion})`);

if (strictReference && strictFlagExplicit) {
    console.log('Strict reference gate: enabled by --strict-reference');
} else if (strictReference) {
    console.log('Strict reference gate: enabled (default)');
} else {
    console.log('Strict reference gate: disabled (--no-strict-reference)');
}

const output = {
    generatedAt: new Date().toISOString(),
    referencePath,
    reference: referenceName,
    referenceSourceType,
    referenceVersion,
    referenceUpdatedAt,
    strictReference,
    selectedWeapons,
    rows,
    passCount,
    totalCount: rows.length,
};

const outPath = path.join(projectRoot, 'spray-report.json');
await fs.writeFile(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`Report written: ${outPath}`);

await fs.rm(tempDir, { recursive: true, force: true });
