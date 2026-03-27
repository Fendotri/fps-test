import fs from 'node:fs/promises';
import path from 'node:path';

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
const normalizeWeaponId = (value) => `${value || ''}`.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');

const parsePositionalCaptureArg = () => {
    for (let i = 0; i < argv.length; i++) {
        const token = `${argv[i] || ''}`.trim();
        if (!token || token.startsWith('--')) continue;
        const prev = `${argv[i - 1] || ''}`;
        if (prev === '--weapon' || prev === '--weapons' || prev === '--state' || prev === '--distance' || prev === '--reference') continue;
        return token;
    }
    return '';
};

const WEAPON_CLASSIFICATION = {
    glock18: 'pistol',
    usp_s: 'pistol',
    deagle: 'pistol',
    mac10: 'smg',
    mp9: 'smg',
    p90: 'smg',
    ak47: 'rifle',
    m4a1_s: 'rifle',
    sg553: 'rifle',
    aug: 'rifle',
    awp: 'sniper',
    xm1014: 'shotgun',
    negev: 'machinegun',
};

const MAGAZINE_SIZE = {
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

const projectRoot = process.cwd();
const captureArg = parsePositionalCaptureArg();
const referencePath = readArg('reference')
    ? path.resolve(projectRoot, readArg('reference'))
    : path.join(projectRoot, 'src/gameplay/combat/sprayReference.csgo128.json');

const weaponFilterArg = readArg('weapon') || readArg('weapons');
const weaponFilter = weaponFilterArg
    ? weaponFilterArg.split(',').map((value) => normalizeWeaponId(value)).filter(Boolean)
    : [];

const stateFilter = `${readArg('state') || ''}`.trim().toLowerCase();
const distanceFilterRaw = Number(readArg('distance'));
const distanceFilter = Number.isFinite(distanceFilterRaw) && (distanceFilterRaw === 10 || distanceFilterRaw === 20)
    ? distanceFilterRaw
    : null;

const requireSilhouette = hasFlag('silhouette');
const strictReference = hasFlag('no-strict-reference') ? false : true;

const rmse = (values) => {
    if (!values.length) return 0;
    const sum = values.reduce((acc, value) => acc + (value * value), 0);
    return Math.sqrt(sum / values.length);
};

const normalizePattern = (points) => {
    if (!Array.isArray(points) || !points.length) return [];
    const first = points[0];
    return points.map((point, index) => ({
        shotIndex: Number(point.shotIndex) || index + 1,
        x: (Number(point.x) || 0) - (Number(first.x) || 0),
        y: (Number(point.y) || 0) - (Number(first.y) || 0),
    }));
};

const toCapturedPoints = (run) => {
    const raw = Array.isArray(run.points) ? run.points : [];
    const points = raw
        .map((point, index) => ({
            shotIndex: Number(point.shotIndex) || (index + 1),
            x: Number(point.x) || 0,
            y: Number(point.y) || 0,
        }))
        .sort((a, b) => a.shotIndex - b.shotIndex);
    return normalizePattern(points);
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

const pointHitsSilhouette = (point, distance) => {
    if (distance !== 10) return false;
    const x = Number(point.x) || 0;
    const y = Number(point.y) || 0;
    const head = ((x / 0.26) ** 2) + (((y + 0.1) / 0.22) ** 2) <= 1;
    const body = ((x / 0.85) ** 2) + (((y + 1.62) / 1.68) ** 2) <= 1;
    return head || body;
};

const computeSilhouette = (points, distance, shotGoal) => {
    if (!Array.isArray(points) || !points.length || distance !== 10) {
        return { hitCount: 0, hitRatio: 0 };
    }
    let hitCount = 0;
    points.forEach((point) => {
        if (pointHitsSilhouette(point, distance)) hitCount += 1;
    });
    const denominator = Math.max(1, shotGoal || points.length || 1);
    return {
        hitCount,
        hitRatio: hitCount / denominator,
    };
};

const resolveThresholds = (classification) => {
    if (classification === 'machinegun') return { rmseFirst30: 3.5, rmseAll: 7.5, max: 12 };
    if (classification === 'sniper') return { rmseAll: 2.5, max: 5.5 };
    if (classification === 'shotgun') return { rmseAll: 6.5, max: 12 };
    return { rmseFirst10: 2.0, rmseAll: 4.0, max: 9.0 };
};

const compare = (distance, current, reference, classification) => {
    const count = Math.min(current.length, reference.length);
    const distanceNorm = Math.max(0.5, Number(distance) / 10);
    const deltas = [];
    for (let i = 0; i < count; i++) {
        const dx = (current[i].x - reference[i].x) / distanceNorm;
        const dy = (current[i].y - reference[i].y) / distanceNorm;
        deltas.push(Math.hypot(dx, dy));
    }

    const thresholds = resolveThresholds(classification);
    const rmseFirst10 = rmse(deltas.slice(0, Math.min(10, deltas.length)));
    const rmseFirst30 = rmse(deltas.slice(0, Math.min(30, deltas.length)));
    const rmseAll = rmse(deltas);
    const maxError = deltas.length ? Math.max(...deltas) : 0;
    const pass =
        (thresholds.rmseFirst10 === undefined || rmseFirst10 <= thresholds.rmseFirst10)
        && (thresholds.rmseFirst30 === undefined || rmseFirst30 <= thresholds.rmseFirst30)
        && rmseAll <= thresholds.rmseAll
        && maxError <= thresholds.max;

    return {
        sampleCount: count,
        rmseFirst10,
        rmseFirst30,
        rmseAll,
        maxError,
        pass,
        thresholds,
    };
};

const normalizeReferencePoints = (rawPoints) => normalizePattern(
    rawPoints.map((point, index) => ({
        shotIndex: index + 1,
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
    })),
);

const findLatestCapture = async () => {
    const files = await fs.readdir(projectRoot);
    const candidates = files
        .filter((file) => /^spray-capture-.*\.json$/i.test(file))
        .map((file) => ({ file, fullPath: path.join(projectRoot, file) }));
    if (!candidates.length) return '';
    const stats = await Promise.all(candidates.map(async (item) => ({
        ...item,
        stat: await fs.stat(item.fullPath),
    })));
    stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
    return stats[0].fullPath;
};

const capturePath = captureArg
    ? path.resolve(projectRoot, captureArg)
    : await findLatestCapture();

if (!capturePath) {
    console.error('No spray-capture JSON found. Usage: npm run spray:analyze -- ./spray-capture-xxxx.json --weapon ak47 --distance 10 --silhouette');
    process.exit(1);
}

const capture = JSON.parse(await fs.readFile(capturePath, 'utf8'));
const runs = Array.isArray(capture.runs) ? capture.runs : [];
if (!runs.length) {
    console.error(`No runs in capture file: ${capturePath}`);
    process.exit(1);
}

const referenceRaw = JSON.parse(await fs.readFile(referencePath, 'utf8'));
const referencePatterns = referenceRaw.patterns || {};
const referenceName = referenceRaw.reference || 'csgo-128';
const referenceSourceType = `${referenceRaw.referenceSourceType || 'unknown'}`.trim().toLowerCase();
const referenceVersion = `${referenceRaw.referenceVersion || 'unversioned'}`;
const referenceUpdatedAt = `${referenceRaw.updatedAt || ''}`;
const hasRequiredReferenceMetadata = !!(referenceRaw.referenceSourceType && referenceRaw.referenceVersion && referenceRaw.updatedAt);

let globalReferenceGate = '';
if (strictReference) {
    if (!hasRequiredReferenceMetadata) globalReferenceGate = 'missing-reference-metadata';
    else if (referenceSourceType !== 'external') globalReferenceGate = `reference-source-not-external (${referenceSourceType})`;
}

const filteredRuns = runs.filter((run) => {
    const weaponId = normalizeWeaponId(run.weaponId || '');
    const state = `${run.state || 'unscoped'}`.trim().toLowerCase();
    const distance = Number(run.distance) || 10;
    if (weaponFilter.length && !weaponFilter.includes(weaponId)) return false;
    if (stateFilter && state !== stateFilter) return false;
    if (distanceFilter && distance !== distanceFilter) return false;
    return true;
});

if (!filteredRuns.length) {
    console.error('No runs matched filters. Check --weapon/--state/--distance.');
    process.exit(1);
}

const analyzed = filteredRuns.map((run) => {
    const weaponId = normalizeWeaponId(run.weaponId || '');
    const state = `${run.state || 'unscoped'}`.trim().toLowerCase() === 'scoped' ? 'scoped' : 'unscoped';
    const distance = Number(run.distance) === 20 ? 20 : 10;
    const classification = WEAPON_CLASSIFICATION[weaponId] || 'rifle';
    const current = toCapturedPoints(run);
    const shotGoal = Math.max(1, Number(run.shotGoal) || current.length || MAGAZINE_SIZE[weaponId] || 30);
    const misses = Number(run.misses);
    const missCount = Number.isFinite(misses) ? Math.max(0, misses) : Math.max(0, shotGoal - current.length);
    const hitRatio = shotGoal > 0 ? Math.max(0, Math.min(1, current.length / shotGoal)) : 0;
    const spacing = computeShotSpacing(current);
    const silhouette = computeSilhouette(current, distance, shotGoal);
    const silhouettePass = distance === 10 ? silhouette.hitCount >= 26 : true;
    const captureMode = `${run.captureMode || 'simulated'}`.toLowerCase() === 'wall' ? 'wall' : 'simulated';

    const rawReference = referencePatterns?.[weaponId]?.[state]?.[`${distance}`];
    const normalizedReference = Array.isArray(rawReference) && rawReference.length
        ? normalizeReferencePoints(rawReference)
        : null;

    if (globalReferenceGate) {
        return {
            id: run.id,
            weaponId,
            state,
            distance,
            classification,
            shotGoal,
            hitCount: current.length,
            miss: missCount,
            hitRatio,
            captureMode,
            valid: false,
            pass: false,
            validReason: globalReferenceGate,
            invalidReason: globalReferenceGate,
            sampleCount: 0,
            rmseFirst10: 999,
            rmseFirst30: 999,
            rmseAll: 999,
            maxError: 999,
            shotSpacingMean: spacing.mean,
            shotSpacingMax: spacing.max,
            silhouetteHitCount: silhouette.hitCount,
            silhouetteHitRatio: silhouette.hitRatio,
            silhouettePass,
            thresholds: resolveThresholds(classification),
        };
    }

    if (!normalizedReference || normalizedReference.length < shotGoal) {
        const reason = !normalizedReference
            ? 'missing-reference'
            : `reference-too-short-${normalizedReference.length}/${shotGoal}`;
        return {
            id: run.id,
            weaponId,
            state,
            distance,
            classification,
            shotGoal,
            hitCount: current.length,
            miss: missCount,
            hitRatio,
            captureMode,
            valid: false,
            pass: false,
            validReason: reason,
            invalidReason: reason,
            sampleCount: 0,
            rmseFirst10: 999,
            rmseFirst30: 999,
            rmseAll: 999,
            maxError: 999,
            shotSpacingMean: spacing.mean,
            shotSpacingMax: spacing.max,
            silhouetteHitCount: silhouette.hitCount,
            silhouetteHitRatio: silhouette.hitRatio,
            silhouettePass,
            thresholds: resolveThresholds(classification),
        };
    }

    if (current.length < shotGoal || missCount > 0) {
        const reason = `invalid-run (${current.length}/${shotGoal} hits, miss=${missCount})`;
        return {
            id: run.id,
            weaponId,
            state,
            distance,
            classification,
            shotGoal,
            hitCount: current.length,
            miss: missCount,
            hitRatio,
            captureMode,
            valid: false,
            pass: false,
            validReason: run.validReason || reason,
            invalidReason: reason,
            sampleCount: current.length,
            rmseFirst10: 999,
            rmseFirst30: 999,
            rmseAll: 999,
            maxError: 999,
            shotSpacingMean: spacing.mean,
            shotSpacingMax: spacing.max,
            silhouetteHitCount: silhouette.hitCount,
            silhouetteHitRatio: silhouette.hitRatio,
            silhouettePass,
            thresholds: resolveThresholds(classification),
        };
    }

    const reference = normalizedReference.slice(0, shotGoal);
    const metrics = compare(distance, current, reference, classification);
    const pass = metrics.pass && (!requireSilhouette || silhouettePass);
    return {
        id: run.id,
        weaponId,
        state,
        distance,
        classification,
        shotGoal,
        hitCount: current.length,
        miss: missCount,
        hitRatio,
        captureMode,
        valid: true,
        pass,
        validReason: run.validReason || 'ok',
        invalidReason: '',
        sampleCount: metrics.sampleCount,
        rmseFirst10: metrics.rmseFirst10,
        rmseFirst30: metrics.rmseFirst30,
        rmseAll: metrics.rmseAll,
        maxError: metrics.maxError,
        shotSpacingMean: spacing.mean,
        shotSpacingMax: spacing.max,
        silhouetteHitCount: silhouette.hitCount,
        silhouetteHitRatio: silhouette.hitRatio,
        silhouettePass,
        thresholds: metrics.thresholds,
    };
});

console.table(analyzed.map((row) => ({
    id: row.id,
    weapon: row.weaponId,
    state: row.state,
    distance: `${row.distance}m`,
    hit: `${row.hitCount}/${row.shotGoal}`,
    miss: row.miss,
    silhouette: `${row.silhouetteHitCount}/${row.shotGoal}`,
    spacing: `${row.shotSpacingMean.toFixed(4)}/${row.shotSpacingMax.toFixed(4)}`,
    rmse10: row.rmseFirst10.toFixed(3),
    rmseAll: row.rmseAll.toFixed(3),
    max: row.maxError.toFixed(3),
    valid: row.valid,
    pass: row.pass,
    reason: row.valid ? 'ok' : row.invalidReason,
})));

const out = {
    generatedAt: new Date().toISOString(),
    capturePath,
    referencePath,
    reference: referenceName,
    referenceSourceType,
    referenceVersion,
    referenceUpdatedAt,
    strictReference,
    filters: {
        weapons: weaponFilter,
        state: stateFilter || null,
        distance: distanceFilter,
        silhouetteGate: requireSilhouette,
    },
    rows: analyzed,
};

const outPath = path.join(projectRoot, 'spray-report.analyzed.json');
await fs.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log(`Analyzed report written: ${outPath}`);
