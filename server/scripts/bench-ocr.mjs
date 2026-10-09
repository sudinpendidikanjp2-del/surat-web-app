// Mengukur akurasi OCR pada korpus sintetis. Pemakaian: node scripts/bench-ocr.mjs [folder] [jumlahSurat]
import fs from 'node:fs';
import path from 'node:path';
import { recognize, stopOcr } from '../src/ocr.js';
import { lev } from '../src/ocrParse.js';

const dir = process.argv[2] || '/tmp/ocr-corpus';
const limit = Number(process.argv[3] || 1e9);
const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
const FIELDS = ['no_surat', 'tgl_surat', 'instansi', 'alamat', 'perihal', 'sifat', 'lampiran', 'asal'];
const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/[.,;:\s]+$/, '').trim();
const sim = (a, b) => { a = norm(a); b = norm(b); const m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 1; };

const stats = {};
const miss = [];
const tiers = (process.env.TIERS || 'ABC').split('');
const names = Object.keys(truth).filter((k) => Number(k.slice(0, 3)) < limit && tiers.includes(truth[k].tier));
const t0 = Date.now();
for (const name of names) {
  const { tier, file, truth: t } = truth[name];
  let r;
  try { r = await recognize(fs.readFileSync(path.join(dir, file))); } catch (e) { r = { fields: {}, quality: { meanConf: 0 }, failed: true }; }
  const s = (stats[tier] ||= { n: 0, exact: 0, total: 0, sim: 0, perField: {}, conf: 0, flagged: 0, wrongUnflagged: 0, wrong: 0 });
  s.n += 1; s.conf += r.quality.meanConf;
  for (const f of FIELDS) {
    const got = r.fields[f]?.value ?? '';
    const ok = norm(got) === norm(t[f]);
    s.total += 1; s.exact += ok ? 1 : 0; s.sim += sim(got, t[f]);
    const pf = (s.perField[f] ||= { ok: 0, n: 0 }); pf.n += 1; pf.ok += ok ? 1 : 0;
    const lowConf = !r.fields[f] || r.fields[f].review;
    if (!ok) { s.wrong += 1; if (!lowConf) s.wrongUnflagged += 1; if (miss.length < 40) miss.push(`${name} ${f}: "${got}" != "${t[f]}" (conf ${r.fields[f]?.conf})`); }
  }
}
console.log(`\n${names.length} gambar dalam ${Math.round((Date.now() - t0) / 1000)} dtk\n`);
for (const [tier, s] of Object.entries(stats).sort()) {
  console.log(`Tingkat ${tier}: akurasi field persis ${(100 * s.exact / s.total).toFixed(1)}%  kemiripan karakter ${(100 * s.sim / s.total).toFixed(1)}%  keyakinan rata-rata ${(s.conf / s.n).toFixed(0)}  salah tak tertandai ${s.wrongUnflagged}/${s.wrong}`);
  console.log('   ' + Object.entries(s.perField).map(([k, v]) => `${k} ${(100 * v.ok / v.n).toFixed(0)}%`).join('  '));
}
if (process.argv.includes('-v')) console.log('\n' + miss.join('\n'));
await stopOcr();
