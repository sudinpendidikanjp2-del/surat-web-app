// Mengukur akurasi OCR pada korpus sintetis dari gen-ocr-corpus.py.
// Pemakaian: OCR_CORPUS=/tmp/ocr-corpus [OCR_LIMIT=50] [TIERS=AB] [VERBOSE=1] npm run bench:ocr
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, test } from 'vitest';
import { recognize, stopOcr } from '@/server/infrastructure/ocr/tesseract';
import { lev } from '@/server/infrastructure/ocr/parse-letter';

interface Truth { tier: string; file: string; truth: Record<string, string> }
interface Stat { n: number; exact: number; total: number; sim: number; conf: number; wrong: number; wrongUnflagged: number; perField: Record<string, { ok: number; n: number }> }
interface Read { fields: Record<string, { value: string; conf: number; review?: boolean }>; quality: { meanConf: number } }

const FIELDS = ['no_surat', 'tgl_surat', 'instansi', 'alamat', 'perihal', 'sifat', 'lampiran', 'asal'];
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/[.,;:\s]+$/, '').trim();
const sim = (a: unknown, b: unknown) => { const x = norm(a); const y = norm(b); const m = Math.max(x.length, y.length); return m ? 1 - lev(x, y) / m : 1; };

afterAll(() => stopOcr());

test('akurasi OCR', async () => {
  const dir = process.env.OCR_CORPUS || '/tmp/ocr-corpus';
  const limit = Number(process.env.OCR_LIMIT || 1e9);
  const tiers = (process.env.TIERS || 'ABC').split('');
  const truth: Record<string, Truth> = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'));
  const names = Object.keys(truth).filter((k) => Number(k.slice(0, 3)) < limit && tiers.includes(truth[k].tier));
  const stats: Record<string, Stat> = {};
  const miss: string[] = [];
  const t0 = Date.now();
  for (const name of names) {
    const { tier, file, truth: t } = truth[name];
    let r: Read;
    try { r = (await recognize(fs.readFileSync(path.join(dir, file)))) as Read; } catch { r = { fields: {}, quality: { meanConf: 0 } }; }
    const s = (stats[tier] ||= { n: 0, exact: 0, total: 0, sim: 0, perField: {}, conf: 0, wrong: 0, wrongUnflagged: 0 });
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
    console.log(`Tingkat ${tier}: akurasi field persis ${((100 * s.exact) / s.total).toFixed(1)}%  kemiripan karakter ${((100 * s.sim) / s.total).toFixed(1)}%  keyakinan rata-rata ${(s.conf / s.n).toFixed(0)}  salah tak tertandai ${s.wrongUnflagged}/${s.wrong}`);
    console.log(`   ${Object.entries(s.perField).map(([k, v]) => `${k} ${((100 * v.ok) / v.n).toFixed(0)}%`).join('  ')}`);
  }
  if (process.env.VERBOSE) console.log(`\n${miss.join('\n')}`);
}, 3_600_000);
