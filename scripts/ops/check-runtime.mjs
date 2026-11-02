#!/usr/bin/env node
/**
 * Pemeriksaan image produksi: modul yang dimuat lewat path berkas (bukan import biasa) tidak terlihat oleh pelacak
 * berkas Next.js, sehingga dapat hilang dari build mandiri tanpa galat saat build. Contoh nyata: worker OCR tesseract.js
 * gagal dengan "Cannot find module 'bmp-js'". Skrip ini mencari setiap require() modul di berkas-berkas itu dan
 * memastikan semuanya dapat ditemukan, ditambah berkas data yang dibaca saat berjalan.
 *
 *   docker compose exec app sisurat check        (CI menjalankannya pada image yang baru dibangun)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { builtinModules } from 'node:module';

const root = process.cwd();
const builtin = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
const problems = [];
let checked = 0;

function* jsFiles(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsFiles(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}

/** Semua require('<modul>') bukan relatif di folder `dir` harus dapat di-resolve dari berkas yang memintanya. */
function checkRequires(dir) {
  if (!fs.existsSync(dir)) { problems.push(`folder tidak ada: ${path.relative(root, dir)}`); return; }
  for (const file of jsFiles(dir)) {
    const req = createRequire(file);
    for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (spec.startsWith('.') || builtin.has(spec)) continue;
      checked++;
      try { req.resolve(spec); } catch { problems.push(`${spec} (diminta ${path.relative(root, file)})`); }
    }
  }
}

checkRequires(path.join(root, 'node_modules/tesseract.js/src/worker-script'));
for (const f of ['node_modules/@tesseract.js-data/ind/4.0.0_best_int', 'node_modules/mupdf/dist', 'node_modules/pdfkit/js/data']) {
  checked++;
  if (!fs.existsSync(path.join(root, f))) problems.push(`berkas data hilang: ${f}`);
}

if (problems.length) {
  console.error(`Image tidak lengkap, ${problems.length} masalah:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}
console.info(`Image lengkap: ${checked} modul dan berkas data ditemukan.`);
