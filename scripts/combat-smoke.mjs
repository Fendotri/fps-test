import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const projectRoot = process.cwd();
const combatSourcePath = path.join(projectRoot, 'src/gameplay/combat/CombatTuning.ts');
const sprayPatternPath = path.join(projectRoot, 'src/gameplay/combat/sprayPattern.fromGif.csgo128.json');
const tempDir = path.join(projectRoot, '.tmp-tests');
const tempModulePath = path.join(tempDir, 'CombatTuning.eval.mjs');

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

const {
    computeShot,
    computeDamageBreakdown,
    resolveCombatProfile,
    seedFromWeapon,
} = mod;

const spreadMag = (shot) => Math.hypot(shot.spreadX, shot.spreadY);

const movement = {
    stand: {
        onFloor: true,
        crouching: false,
        walking: false,
        horizontalSpeed: 0,
        verticalSpeed: 0,
        speed01: 0,
        landingImpact: 0,
        airborneTime: 0,
    },
    crouch: {
        onFloor: true,
        crouching: true,
        walking: false,
        horizontalSpeed: 0,
        verticalSpeed: 0,
        speed01: 0,
        landingImpact: 0,
        airborneTime: 0,
    },
    walk: {
        onFloor: true,
        crouching: false,
        walking: true,
        horizontalSpeed: 60,
        verticalSpeed: 0,
        speed01: 0.32,
        landingImpact: 0,
        airborneTime: 0,
    },
    run: {
        onFloor: true,
        crouching: false,
        walking: false,
        horizontalSpeed: 220,
        verticalSpeed: 0,
        speed01: 1,
        landingImpact: 0,
        airborneTime: 0,
    },
    air: {
        onFloor: false,
        crouching: false,
        walking: false,
        horizontalSpeed: 180,
        verticalSpeed: 7.8,
        speed01: 1.05,
        landingImpact: 0.2,
        airborneTime: 0.2,
    },
};

const weaponIds = [
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
    'nova',
    'negev',
    'm9',
];

const failures = [];
const rows = [];

for (const weaponId of weaponIds) {
    const profile = resolveCombatProfile(weaponId);
    const seed = seedFromWeapon(weaponId, 'smoke');

    const shotStand = computeShot({
        profileOrName: weaponId,
        movement: movement.stand,
        recoilIndex: 0,
        recoverLine: 0,
        weaponSeed: seed,
        shotCounter: 0,
        recoilControl: 4,
        accurateRange: 120,
        timeSinceLastShotSeconds: 999,
    });

    const shotWalk = computeShot({
        profileOrName: weaponId,
        movement: movement.walk,
        recoilIndex: 0,
        recoverLine: 0,
        weaponSeed: seed,
        shotCounter: 0,
        recoilControl: 4,
        accurateRange: 120,
        timeSinceLastShotSeconds: 999,
    });

    const shotCrouch = computeShot({
        profileOrName: weaponId,
        movement: movement.crouch,
        recoilIndex: 0,
        recoverLine: 0,
        weaponSeed: seed,
        shotCounter: 0,
        recoilControl: 4,
        accurateRange: 120,
        timeSinceLastShotSeconds: 999,
    });

    const shotRun = computeShot({
        profileOrName: weaponId,
        movement: movement.run,
        recoilIndex: 0,
        recoverLine: 0,
        weaponSeed: seed,
        shotCounter: 0,
        recoilControl: 4,
        accurateRange: 120,
        timeSinceLastShotSeconds: 999,
    });

    const shotAir = computeShot({
        profileOrName: weaponId,
        movement: movement.air,
        recoilIndex: 0,
        recoverLine: 0,
        weaponSeed: seed,
        shotCounter: 0,
        recoilControl: 4,
        accurateRange: 120,
        timeSinceLastShotSeconds: 999,
    });

    const shotSecond = computeShot({
        profileOrName: weaponId,
        movement: movement.stand,
        recoilIndex: shotStand.nextRecoilIndex,
        recoverLine: shotStand.nextRecoverLine,
        weaponSeed: seed,
        shotCounter: 1,
        recoilControl: 4,
        accurateRange: 120,
        timeSinceLastShotSeconds: 0.08,
    });

    const standSpread = spreadMag(shotStand);
    const crouchSpread = spreadMag(shotCrouch);
    const walkSpread = spreadMag(shotWalk);
    const runSpread = spreadMag(shotRun);
    const airSpread = spreadMag(shotAir);
    const secondSpread = spreadMag(shotSecond);

    const chestArmor = computeDamageBreakdown(weaponId, 'CHEST', 0, 100, true);
    const chestNoArmor = computeDamageBreakdown(weaponId, 'CHEST', 0, 0, false);
    const headArmor = computeDamageBreakdown(weaponId, 'HEAD', 0, 100, true);
    const legArmor = computeDamageBreakdown(weaponId, 'LEG', 0, 100, true);
    const headNoArmor = computeDamageBreakdown(weaponId, 'HEAD', 0, 0, false);
    const legNoArmor = computeDamageBreakdown(weaponId, 'LEG', 0, 0, false);
    const chestFarArmor = computeDamageBreakdown(weaponId, 'CHEST', 30, 100, true);

    const cls = `${profile.classification}`.toLowerCase();
    if (cls !== 'knife') {
        if (!(standSpread < crouchSpread)) failures.push(`${weaponId}: stand spread should be lower than crouch spread`);
        if (!(crouchSpread < walkSpread)) failures.push(`${weaponId}: crouch spread should be lower than walk spread`);
        if (!(walkSpread < runSpread)) failures.push(`${weaponId}: walk spread should be lower than run spread`);
        if (!(runSpread < airSpread)) failures.push(`${weaponId}: run spread should be lower than air spread`);
    }

    if (cls !== 'sniper' && cls !== 'knife' && !(secondSpread >= (standSpread * 0.8))) {
        failures.push(`${weaponId}: follow-up spread is too low vs first shot`);
    }
    if (!(headNoArmor.healthDamage >= chestNoArmor.healthDamage && chestNoArmor.healthDamage >= legNoArmor.healthDamage)) {
        failures.push(`${weaponId}: unarmored hitgroup damage order invalid`);
    }
    if (!(chestArmor.healthDamage <= chestNoArmor.healthDamage)) failures.push(`${weaponId}: armor mitigation invalid`);
    if (cls !== 'knife' && !(chestFarArmor.healthDamage <= chestArmor.healthDamage)) {
        failures.push(`${weaponId}: range falloff invalid`);
    }

    rows.push({
        weapon: weaponId,
        class: cls,
        spreadStand: standSpread.toFixed(5),
        spreadCrouch: crouchSpread.toFixed(5),
        spreadWalk: walkSpread.toFixed(5),
        spreadRun: runSpread.toFixed(5),
        spreadAir: airSpread.toFixed(5),
        spreadSecond: secondSpread.toFixed(5),
        dmgHeadArm: headArmor.healthDamage,
        dmgChestArm: chestArmor.healthDamage,
        dmgLegArm: legArmor.healthDamage,
        dmgChestFarArm: chestFarArmor.healthDamage,
    });
}

console.table(rows);

const hasFailures = failures.length > 0;
if (hasFailures) {
    console.error('\nCombat smoke test failed:');
    failures.forEach((f) => console.error(`- ${f}`));
    process.exitCode = 1;
} else {
    console.log('\nCombat smoke test passed.');
}

await fs.rm(tempDir, { recursive: true, force: true });
