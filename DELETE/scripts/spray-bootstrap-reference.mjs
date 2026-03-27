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

const projectRoot = process.cwd();
const combatSourcePath = path.join(projectRoot, 'src/gameplay/combat/CombatTuning.ts');
const sprayPatternPath = path.join(projectRoot, 'src/gameplay/combat/sprayPattern.fromGif.csgo128.json');
const externalReferencePath = path.join(projectRoot, 'src/gameplay/combat/sprayReference.csgo128.json');
const generatedReferencePath = path.join(projectRoot, 'src/gameplay/combat/sprayReference.generated.csgo128.json');

const outArg = readArg('out');
const outputPath = outArg
    ? (outArg.toLowerCase() === 'generated' ? generatedReferencePath : path.resolve(projectRoot, outArg))
    : generatedReferencePath;

if (!hasFlag('allow-overwrite') && path.resolve(outputPath) === path.resolve(externalReferencePath)) {
    console.error('Refusing to overwrite external validation reference. Use --out generated (default).');
    process.exitCode = 1;
    process.exit(1);
}

const tempDir = path.join(projectRoot, '.tmp-tests');
const tempModulePath = path.join(tempDir, 'CombatTuning.spray.bootstrap.eval.mjs');

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
    .replace("import { GameObjectMaterialEnum } from '@src/gameplay/abstract/GameObjectMaterialEnum';", enumShim);

await fs.mkdir(tempDir, { recursive: true });
await fs.writeFile(tempModulePath, patched, 'utf8');

const mod = await import(pathToFileURL(tempModulePath).href);
const { computeShot, recoverRecoil, resolveCombatProfile, seedFromWeapon } = mod;

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

const SCOPED = new Set(['aug', 'sg553', 'awp']);
const DISTANCES = [10, 20];
const SPRAY_SEED_TAG = 'spray-csgo128';
const MAGAZINE = {
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

const STAND = {
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
    const first = points[0];
    return points.map((point, index) => ({
        shotIndex: index + 1,
        x: point.x - first.x,
        y: point.y - first.y,
    }));
};

const round6 = (value) => Math.round(Number(value) * 1_000_000) / 1_000_000;

const simulate = (weaponId, state, distance, shots) => {
    const seed = seedFromWeapon(weaponId, SPRAY_SEED_TAG);
    const profile = resolveCombatProfile(weaponId);
    const fireRate = Math.max(0.04, 60 / Math.max(1, Number(profile.rpm) || 600));
    const recoilControl = Math.max(1, Number(WEAPON_ACCURACY[weaponId]?.recoilControl) || 4);
    const accurateRange = Math.max(2, Number(WEAPON_ACCURACY[weaponId]?.accurateRange) || 120);
    const scoped = state === 'scoped';

    let recoilIndex = 0;
    let recoverLine = 0;
    let timeSinceLastShotSeconds = 999;
    const points = [];

    for (let i = 0; i < shots; i++) {
        const shot = computeShot({
            profileOrName: profile,
            movement: STAND,
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

        const recovery = recoverRecoil({
            profileOrName: profile,
            deltaTime: fireRate,
            triggerDown: true,
            recoilIndex,
            recoverLine,
            pitchDebt: 0,
            yawDebt: 0,
        });

        recoilIndex = recovery.nextRecoilIndex;
        recoverLine = recovery.nextRecoverLine;
        timeSinceLastShotSeconds = fireRate;
    }

    return normalize(points);
};

const patterns = {};
for (const weaponId of WEAPONS) {
    patterns[weaponId] = {};
    const states = ['unscoped'];
    if (SCOPED.has(weaponId)) states.push('scoped');

    for (const state of states) {
        patterns[weaponId][state] = {};
        for (const distance of DISTANCES) {
            const shots = Math.max(1, Number(MAGAZINE[weaponId]) || 30);
            const pattern = simulate(weaponId, state, distance, shots).map((point) => ({
                x: round6(point.x),
                y: round6(point.y),
            }));
            patterns[weaponId][state][`${distance}`] = pattern;
        }
    }
}

const output = {
    version: 1,
    reference: 'csgo-128',
    referenceSourceType: 'bootstrap',
    referenceVersion: `bootstrap-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}`,
    updatedAt: new Date().toISOString(),
    notes: 'Bootstrap reference generated from current deterministic combat profile. Validation icin kullanmayin.',
    patterns,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Bootstrap reference written: ${outputPath}`);
console.warn('WARNING: This file is bootstrap/generated and NOT valid as strict external reference.');
await fs.rm(tempDir, { recursive: true, force: true });
