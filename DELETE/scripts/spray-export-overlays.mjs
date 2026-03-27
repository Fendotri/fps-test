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

const projectRoot = process.cwd();
const combatSourcePath = path.join(projectRoot, 'src/gameplay/combat/CombatTuning.ts');
const sprayPatternPath = path.join(projectRoot, 'src/gameplay/combat/sprayPattern.fromGif.csgo128.json');
const referencePath = readArg('reference')
    ? path.resolve(projectRoot, readArg('reference'))
    : path.join(projectRoot, 'src/gameplay/combat/sprayReference.csgo128.json');
const outDir = readArg('out')
    ? path.resolve(projectRoot, readArg('out'))
    : path.join(projectRoot, 'spray-overlays');

const defaultWeapons = ['ak47', 'm4a1_s', 'mp9'];
const weaponFilterRaw = readArg('weapon') || readArg('weapons');
const selectedWeapons = weaponFilterRaw
    ? weaponFilterRaw.split(',').map((item) => toWeaponId(item)).filter(Boolean)
    : defaultWeapons;
const includeCompensation = hasFlag('include-compensation');

const tempDir = path.join(projectRoot, '.tmp-tests');
const tempModulePath = path.join(tempDir, 'CombatTuning.overlay.eval.mjs');

const source = await fs.readFile(combatSourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
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

const referenceRaw = JSON.parse(await fs.readFile(referencePath, 'utf8'));
const referencePatterns = referenceRaw.patterns || {};
const referenceName = referenceRaw.reference || 'csgo-128';
const referenceSourceType = `${referenceRaw.referenceSourceType || 'unknown'}`.trim().toLowerCase();
const referenceVersion = `${referenceRaw.referenceVersion || 'unversioned'}`;

const DISTANCES = [10, 20];
const STATES = ['unscoped'];
const SCOPED = new Set(['aug', 'sg553', 'awp']);
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
    const first = points[0];
    return points.map((point, index) => ({
        shotIndex: index + 1,
        x: point.x - first.x,
        y: point.y - first.y,
    }));
};

const rmse = (values) => {
    if (!values.length) return 0;
    const sum = values.reduce((acc, value) => acc + (value * value), 0);
    return Math.sqrt(sum / values.length);
};

const computeShotSpacing = (points) => {
    if (!Array.isArray(points) || points.length < 2) return { mean: 0, max: 0 };
    const steps = [];
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        steps.push(Math.hypot(dx, dy));
    }
    const total = steps.reduce((acc, value) => acc + value, 0);
    return {
        mean: steps.length ? total / steps.length : 0,
        max: steps.length ? Math.max(...steps) : 0,
    };
};

const computeSilhouette = (points, distance, shotGoal) => {
    if (!Array.isArray(points) || !points.length || Number(distance) !== 10) {
        return { hitCount: 0, hitRatio: 0 };
    }
    let hitCount = 0;
    points.forEach((point) => {
        const x = Number(point.x) || 0;
        const y = Number(point.y) || 0;
        const head = ((x / 0.26) ** 2) + (((y + 0.1) / 0.22) ** 2) <= 1;
        const body = ((x / 0.85) ** 2) + (((y + 1.62) / 1.68) ** 2) <= 1;
        if (head || body) hitCount += 1;
    });
    const denominator = Math.max(1, Number(shotGoal) || points.length || 1);
    return {
        hitCount,
        hitRatio: hitCount / denominator,
    };
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

const compare = (distance, current, reference) => {
    const sampleCount = Math.min(current.length, reference.length);
    const distanceNorm = Math.max(0.5, Number(distance) / 10);
    const deltas = [];
    for (let i = 0; i < sampleCount; i++) {
        const dx = (current[i].x - reference[i].x) / distanceNorm;
        const dy = (current[i].y - reference[i].y) / distanceNorm;
        deltas.push(Math.hypot(dx, dy));
    }
    const rmseFirst10 = rmse(deltas.slice(0, Math.min(10, deltas.length)));
    const rmseAll = rmse(deltas);
    const maxError = deltas.length ? Math.max(...deltas) : 0;
    return { sampleCount, rmseFirst10, rmseAll, maxError, deltas };
};

const escapeHtml = (value) => `${value || ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');

const toSvg = (args) => {
    const { title, weaponId, state, distance, current, reference, metrics, includeCompensationPath } = args;
    const width = 960;
    const height = 640;
    const pad = 64;
    const innerW = width - (pad * 2);
    const innerH = height - (pad * 2);

    const all = [...current, ...reference];
    const maxAbs = Math.max(
        0.8,
        ...all.map((point) => Math.max(Math.abs(point.x), Math.abs(point.y))),
    );
    const scale = Math.min(innerW, innerH) * 0.46 / maxAbs;
    const cx = width * 0.5;
    const cy = height * 0.54;
    const toCanvas = (point) => ({
        x: cx + (point.x * scale),
        y: cy - (point.y * scale),
    });

    const polyline = (points) => points.map((point) => {
        const p = toCanvas(point);
        return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(' ');

    const deltaLines = [];
    const deltaCount = Math.min(current.length, reference.length);
    for (let i = 0; i < deltaCount; i++) {
        const c = toCanvas(current[i]);
        const r = toCanvas(reference[i]);
        deltaLines.push(`<line x1="${c.x.toFixed(2)}" y1="${c.y.toFixed(2)}" x2="${r.x.toFixed(2)}" y2="${r.y.toFixed(2)}" stroke="rgba(255,108,108,0.45)" stroke-width="1"/>`);
    }

    const compensationPoints = [];
    if (includeCompensationPath) {
        let x = 0;
        let y = 0;
        compensationPoints.push({ x, y });
        for (let i = 1; i < reference.length; i++) {
            const dx = reference[i].x - reference[i - 1].x;
            const dy = reference[i].y - reference[i - 1].y;
            x -= dx;
            y -= dy;
            compensationPoints.push({ x, y });
        }
    }

    const shotLabels = [];
    for (let i = 0; i < current.length; i++) {
        if (i !== 0 && ((i + 1) % 5) !== 0) continue;
        const p = toCanvas(current[i]);
        shotLabels.push(`<text x="${(p.x + 6).toFixed(2)}" y="${(p.y - 6).toFixed(2)}" fill="#d7ecff" font-size="10">${i + 1}</text>`);
    }

    const grid = [];
    for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = pad + (innerW * t);
        const y = pad + (innerH * t);
        const major = i === 5;
        grid.push(`<line x1="${x.toFixed(2)}" y1="${pad}" x2="${x.toFixed(2)}" y2="${(height - pad)}" stroke="${major ? 'rgba(181,208,247,0.35)' : 'rgba(124,153,195,0.18)'}" stroke-width="${major ? '1.4' : '1'}"/>`);
        grid.push(`<line x1="${pad}" y1="${y.toFixed(2)}" x2="${(width - pad)}" y2="${y.toFixed(2)}" stroke="${major ? 'rgba(181,208,247,0.35)' : 'rgba(124,153,195,0.18)'}" stroke-width="${major ? '1.4' : '1'}"/>`);
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#0b111a"/>
  <rect x="${pad}" y="${pad}" width="${innerW}" height="${innerH}" fill="#101a28" stroke="#2a3f5f" stroke-width="1.2"/>
  ${grid.join('\n  ')}
  ${deltaLines.join('\n  ')}
  <polyline points="${polyline(reference)}" fill="none" stroke="#f2ca61" stroke-width="2.1"/>
  <polyline points="${polyline(current)}" fill="none" stroke="#63daff" stroke-width="2.1"/>
  ${includeCompensationPath && compensationPoints.length ? `<polyline points="${polyline(compensationPoints)}" fill="none" stroke="#ff6a9d" stroke-width="1.8"/>` : ''}
  ${shotLabels.join('\n  ')}
  <text x="${pad}" y="28" fill="#e6f0ff" font-size="20" font-family="Consolas, monospace">${escapeHtml(title)}</text>
  <text x="${pad}" y="50" fill="#b9d0ef" font-size="13" font-family="Consolas, monospace">weapon=${weaponId} state=${state} distance=${distance}m | shots=${current.length}</text>
  <text x="${pad}" y="70" fill="#9dc0e8" font-size="12" font-family="Consolas, monospace">RMSE10=${metrics.rmseFirst10.toFixed(3)} RMSE(all)=${metrics.rmseAll.toFixed(3)} MAX=${metrics.maxError.toFixed(3)}</text>
  <rect x="${width - 260}" y="18" width="232" height="${includeCompensationPath ? '90' : '70'}" rx="8" fill="#0f1826" stroke="#2a3b57"/>
  <circle cx="${width - 242}" cy="38" r="5" fill="#63daff"/>
  <text x="${width - 230}" y="42" fill="#cfeaff" font-size="12" font-family="Consolas, monospace">Current</text>
  <circle cx="${width - 242}" cy="58" r="5" fill="#f2ca61"/>
  <text x="${width - 230}" y="62" fill="#fff2cf" font-size="12" font-family="Consolas, monospace">Reference</text>
  <circle cx="${width - 242}" cy="78" r="5" fill="#ff7a7a"/>
  <text x="${width - 230}" y="82" fill="#ffc8c8" font-size="12" font-family="Consolas, monospace">Delta</text>
  ${includeCompensationPath ? `<circle cx="${width - 242}" cy="98" r="5" fill="#ff6a9d"/><text x="${width - 230}" y="102" fill="#ffd0e2" font-size="12" font-family="Consolas, monospace">Compensation</text>` : ''}
</svg>`;
};

await fs.mkdir(outDir, { recursive: true });

const combos = [];
for (const weaponId of selectedWeapons) {
    const states = [...STATES];
    if (SCOPED.has(weaponId)) states.push('scoped');
    for (const state of states) {
        for (const distance of DISTANCES) {
            const shots = Math.max(1, Number(WEAPON_RUNTIME[weaponId]) || 30);
            const current = simulate(weaponId, state, distance, shots);
            const referenceRawPoints = referencePatterns?.[weaponId]?.[state]?.[`${distance}`];
            if (!Array.isArray(referenceRawPoints) || !referenceRawPoints.length) {
                combos.push({
                    weaponId,
                    state,
                    distance,
                    error: 'missing-reference',
                });
                continue;
            }
            const reference = normalize(referenceRawPoints.map((point) => ({
                x: Number(point?.x) || 0,
                y: Number(point?.y) || 0,
            }))).slice(0, shots);
            const metrics = compare(distance, current, reference);
            const spacing = computeShotSpacing(current);
            const silhouette = computeSilhouette(current, distance, shots);
            const fileName = `overlay-${weaponId}-${state}-${distance}m.svg`;
            const svg = toSvg({
                title: `${weaponId.toUpperCase()} ${distance}m ${state.toUpperCase()}`,
                weaponId,
                state,
                distance,
                current,
                reference,
                metrics,
                includeCompensationPath: includeCompensation,
            });
            await fs.writeFile(path.join(outDir, fileName), svg, 'utf8');
            combos.push({
                weaponId,
                state,
                distance,
                shots,
                fileName,
                rmseFirst10: metrics.rmseFirst10,
                rmseAll: metrics.rmseAll,
                maxError: metrics.maxError,
                shotSpacingMean: spacing.mean,
                shotSpacingMax: spacing.max,
                silhouetteHitCount: silhouette.hitCount,
                silhouetteHitRatio: silhouette.hitRatio,
            });
        }
    }
}

const indexHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Spray Overlay Export</title>
<style>
body{margin:0;padding:18px;background:#09111b;color:#e7efff;font-family:Consolas,monospace}
h1{margin:0 0 8px 0}
.sub{opacity:.85;margin-bottom:14px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(420px,1fr));gap:14px}
.card{background:#0e1623;border:1px solid #243856;border-radius:10px;padding:10px}
.meta{font-size:12px;color:#b8cff0;margin-bottom:8px}
img{width:100%;height:auto;border:1px solid #2a3f5f;border-radius:8px;background:#0b111a}
</style>
</head>
<body>
<h1>Spray Overlay Export</h1>
<div class="sub">Reference: ${escapeHtml(referenceName)} (${escapeHtml(referenceSourceType)} @ ${escapeHtml(referenceVersion)})</div>
<div class="sub">Compensation Overlay: ${includeCompensation ? 'ON' : 'OFF'} (enable with --include-compensation)</div>
<div class="grid">
${combos.map((combo) => {
    if (combo.error) {
        return `<div class="card"><div class="meta">${combo.weaponId} ${combo.distance}m ${combo.state} | ${combo.error}</div></div>`;
    }
    return `<div class="card">
      <div class="meta">${combo.weaponId} ${combo.distance}m ${combo.state} | RMSE10=${combo.rmseFirst10.toFixed(3)} RMSE=${combo.rmseAll.toFixed(3)} MAX=${combo.maxError.toFixed(3)} | SPACING=${combo.shotSpacingMean.toFixed(4)}/${combo.shotSpacingMax.toFixed(4)} | SILH=${combo.silhouetteHitCount}/${combo.shots} (${combo.silhouetteHitRatio.toFixed(3)})</div>
      <img src="./${combo.fileName}" alt="${combo.weaponId} ${combo.distance}m ${combo.state}"/>
    </div>`;
}).join('\n')}
</div>
</body>
</html>`;

await fs.writeFile(path.join(outDir, 'index.html'), indexHtml, 'utf8');
await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    reference: referenceName,
    referenceSourceType,
    referenceVersion,
    referencePath,
    includeCompensation,
    combos,
}, null, 2), 'utf8');

console.log(`Overlay export written: ${outDir}`);
console.log(`Open: ${path.join(outDir, 'index.html')}`);

await fs.rm(tempDir, { recursive: true, force: true });
