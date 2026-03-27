import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const readArg = (name, fallback = '') => {
    const key = `--${name}`;
    const withEq = argv.find((item) => item.startsWith(`${key}=`));
    if (withEq) return withEq.slice(key.length + 1);
    const idx = argv.indexOf(key);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
};

const root = process.cwd();
const dirArg = readArg('dir', 'cube_gunman');
const maxMb = Number(readArg('max-mb', '8'));
const topN = Number(readArg('top', '10'));

const outDir = path.resolve(root, dirArg);

const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(full)));
        else if (entry.isFile()) {
            const st = await fs.stat(full);
            files.push({ path: full, size: st.size });
        }
    }
    return files;
};

const files = await walk(outDir);
const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
const totalMb = totalBytes / (1024 * 1024);

const top = [...files]
    .sort((a, b) => b.size - a.size)
    .slice(0, Math.max(1, topN))
    .map((f) => ({
        file: path.relative(outDir, f.path).replace(/\\/g, '/'),
        mb: Number((f.size / (1024 * 1024)).toFixed(3)),
    }));

console.log(`Build dir: ${outDir}`);
console.log(`Total files: ${files.length}`);
console.log(`Total size: ${totalMb.toFixed(3)} MB`);
console.table(top);

if (Number.isFinite(maxMb) && totalMb > maxMb) {
    console.error(`Size gate failed: ${totalMb.toFixed(3)} MB > ${maxMb.toFixed(3)} MB`);
    process.exit(1);
}

console.log(`Size gate passed: ${totalMb.toFixed(3)} MB <= ${maxMb.toFixed(3)} MB`);
