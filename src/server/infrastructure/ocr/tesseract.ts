import path from 'node:path';
import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import { config } from '@/server/config';
import type { OcrEngine, OcrResult } from '@/server/application/ports';
import { parseLetter, type Line } from './parse-letter';
import { recognizeRemote } from './remote';

// Model bahasa Indonesia (best_int). Path dari cwd agar sama di mode dev, build standalone, dan uji.
const LANG_DIR = process.env.OCR_LANG_DIR || path.join(process.cwd(), 'node_modules/@tesseract.js-data/ind/4.0.0_best_int');

type Worker = Awaited<ReturnType<typeof createWorker>>;
let workerPromise: Promise<Worker> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('ind', 1, { langPath: LANG_DIR, gzip: true, cacheMethod: 'none' }).then(async (w) => {
      await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: '1' });
      return w;
    });
  }
  return workerPromise;
}

export async function stopOcr() {
  if (workerPromise) { const w = await workerPromise; await w.terminate(); workerPromise = null; }
}

/** Antrean tunggal: satu pekerja OCR memproses satu gambar pada satu waktu. */
const serial = <T,>(fn: () => Promise<T>): Promise<T> => { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; };

const TARGET_W = 2400;

/**
 * Meratakan pencahayaan tidak rata (bayangan, gradien) dengan membagi citra dengan latar yang diburamkan,
 * lalu memetakan ulang tingkat abu di sekitar ambang Otsu. Rentang sempit memutihkan tepi kertas dan bayangan,
 * tetapi tetap mempertahankan tepi huruf yang halus. Ambang mengikuti citra sehingga foto buram tidak menebal.
 */
async function flatten(gray: Buffer, w: number, h: number) {
  const bg = await sharp(gray, { raw: { width: w, height: h, channels: 1 } }).blur(Math.max(20, w / 60)).raw().toBuffer();
  // Latar acuan = persentil ke-95 kecerahan terblur (kertas). Area jauh lebih gelap adalah meja atau bayangan di luar kertas.
  // Ambang 0,74: di bawah blok teks rapat (sekitar 0,8) dan di atas meja yang lazim (sekitar 0,68 atau kurang).
  const hist = new Array(256).fill(0);
  for (let i = 0; i < bg.length; i += 7) hist[bg[i]] += 1;
  let acc = 0; let ref = 255; const n = bg.length / 7;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.05) { ref = v; break; } }
  const floor = ref * 0.6;
  const inPaper = (x: number, y: number) => bg[y * w + x] >= floor;
  const rows = new Uint32Array(h); const cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bg[y * w + x] >= floor) { rows[y]++; cols[x]++; }
  const first = (arr: Uint32Array, need: number) => arr.findIndex((c) => c >= need);
  const last = (arr: Uint32Array, need: number) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] >= need) return i; return -1; };
  let x0 = first(cols, h * 0.5); let x1 = last(cols, h * 0.5); let y0 = first(rows, w * 0.5); let y1 = last(rows, w * 0.5);
  if (x0 < 0 || y0 < 0 || x1 - x0 < w * 0.4 || y1 - y0 < h * 0.4) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const inset = Math.round(w * 0.012);
  x0 += inset; y0 += inset; x1 -= inset; y1 -= inset;
  const cw = x1 - x0 + 1; const ch = y1 - y0 + 1;
  const ratio = Buffer.allocUnsafe(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y + y0) * w + (x + x0);
      if (!inPaper(x + x0, y + y0)) { ratio[y * cw + x] = 255; continue; }
      const v = (gray[i] * 238) / (bg[i] || 1);
      ratio[y * cw + x] = v > 255 ? 255 : v;
    }
  }
  return { ratio, w: cw, h: ch };
}

/**
 * Tiga cara memetakan tingkat abu setelah pencahayaan diratakan. Foto bersih paling akurat dengan rentang sempit (keras),
 * foto buram memerlukan ambang setengah-maksimum (lunak) agar huruf tidak menebal, dan citra abu apa adanya sebagai cadangan.
 */
type Mode = 'hard' | 'soft' | 'mid' | 'gray';
function mapLevels(ratio: Buffer, mode: Mode, lm: Buffer | null) {
  const out = Buffer.allocUnsafe(ratio.length);
  let lo = 92; let scale = 255 / 80;
  if (mode === 'soft') {
    const h2 = new Array(256).fill(0);
    for (let i = 0; i < ratio.length; i += 3) h2[ratio[i]] += 1;
    const total = ratio.length / 3;
    let c = 0; let dark = 0;
    for (let v = 0; v < 256; v++) { c += h2[v]; if (c >= total * 0.012) { dark = v; break; } }
    const t = Math.min(185, Math.max(100, (dark + 238) / 2));
    lo = t - 36; scale = 255 / 72;
  }
  if (mode === 'mid') { lo = 110; lm = null; }
  if (mode === 'gray') {
    const k = 255 / 238;
    for (let i = 0; i < out.length; i++) { const v = ratio[i] * k; out[i] = v > 255 ? 255 : v; }
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    // Piksel baru dianggap tinta bila jelas lebih gelap dari sekitarnya. Area abu rata berbintik (bayangan, derau) menjadi putih.
    if (lm && ratio[i] > lm[i] * 0.8) { out[i] = 255; continue; }
    const v = (ratio[i] - lo) * scale;
    out[i] = v > 255 ? 255 : v < 0 ? 0 : v;
  }
  return out;
}

/**
 * Putihkan pita gelap di tepi citra (sisa meja, tepi kertas, bayangan). Dari tiap sisi, kolom atau baris dengan lebih dari
 * 20% piksel gelap dihapus terus ke arah dalam sampai ditemui baris bersih. Hanya tepi luar 8% yang diperiksa,
 * jadi garis kop atau isi surat tidak tersentuh.
 */
function clearBorders(buf: Buffer, w: number, h: number) {
  const dark = (i: number) => buf[i] < 128;
  const colFrac = (x: number) => { let c = 0; for (let y = 0; y < h; y += 2) if (dark(y * w + x)) c++; return c / (h / 2); };
  const rowFrac = (y: number) => { let c = 0; for (let x = 0; x < w; x += 2) if (dark(y * w + x)) c++; return c / (w / 2); };
  const wipeCols = (from: number, to: number) => { for (let x = from; x < to; x++) for (let y = 0; y < h; y++) buf[y * w + x] = 255; };
  const wipeRows = (from: number, to: number) => { buf.fill(255, from * w, to * w); };
  const maxX = Math.floor(w * 0.08); const maxY = Math.floor(h * 0.05);
  // sisi kiri atau atas: cari indeks terjauh dalam zona tepi yang gelap, lalu hapus dari tepi sampai di situ
  const edge = (max: number, frac: (i: number) => number, wipe: (a: number, b: number) => void, fromEnd: boolean, len: number) => {
    let bad = -1;
    for (let k = 0; k < max; k++) if (frac(fromEnd ? len - 1 - k : k) > 0.2) bad = k;
    if (bad < 0) return;
    let e = bad + 1;
    while (e < max && frac(fromEnd ? len - 1 - e : e) > 0.06) e++;
    if (fromEnd) wipe(len - e, len); else wipe(0, e);
  };
  edge(maxX, colFrac, wipeCols, false, w);
  edge(maxX, colFrac, wipeCols, true, w);
  edge(maxY, rowFrac, wipeRows, false, h);
  edge(maxY, rowFrac, wipeRows, true, h);
  // Margin terluar 2% tidak pernah berisi isi surat. Hapus sisa garis tipis dan bintik di sana, yang dapat membuat analisis tata letak macet.
  wipeCols(0, Math.floor(w * 0.02)); wipeCols(w - Math.floor(w * 0.02), w);
  wipeRows(0, Math.floor(h * 0.015)); wipeRows(h - Math.floor(h * 0.015), h);
  return buf;
}

/** Perkiraan kemiringan dengan variansi proyeksi baris pada citra kecil. Mengembalikan derajat. */
async function estimateSkew(gray: Buffer, w: number, h: number) {
  const sw = 700;
  const small = await sharp(gray, { raw: { width: w, height: h, channels: 1 } }).resize({ width: sw }).threshold(170).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = small;
  const score = async (angle: number) => {
    const r = await sharp(data, { raw: { width: info.width, height: info.height, channels: 1 } })
      .rotate(angle, { background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
    const { width: rw, height: rh } = r.info;
    let sum = 0; let sumSq = 0;
    for (let y = 0; y < rh; y++) {
      let dark = 0;
      const off = y * rw;
      for (let x = 0; x < rw; x++) if (r.data[off + x] < 128) dark++;
      sum += dark; sumSq += dark * dark;
    }
    const mean = sum / rh;
    return sumSq / rh - mean * mean;
  };
  let best = { a: 0, s: -1 };
  for (let a = -6; a <= 6; a += 1) { const s = await score(a); if (s > best.s) best = { a, s }; }
  const center = best.a;
  for (let a = center - 0.75; a <= center + 0.75; a += 0.25) { const s = await score(a); if (s > best.s) best = { a, s }; }
  return best.a;
}

/** Ukuran ketajaman: variansi Laplacian pada citra kecil. Semakin kecil semakin buram. */
async function sharpness(gray: Buffer, w: number, h: number) {
  const { data, info } = await sharp(gray, { raw: { width: w, height: h, channels: 1 } }).resize({ width: 900 })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] }).raw().toBuffer({ resolveWithObject: true });
  let s = 0; let ss = 0;
  for (const v of data) { s += v; ss += v * v; }
  const n = data.length;
  const mean = s / n;
  return ss / n - mean * mean + 0 * info.width;
}

/** Simpangan baku derau pada piksel kertas (setelah pencahayaan diratakan). Foto bersih mendekati 0. */
function paperNoise(ratio: Buffer) {
  let n = 0; let sum = 0; let sq = 0;
  for (let i = 0; i < ratio.length; i += 5) { const v = ratio[i]; if (v > 215 && v < 255) { n++; sum += v; sq += v * v; } }
  if (n < 1000) return 0;
  const m = sum / n;
  return Math.sqrt(Math.max(0, sq / n - m * m));
}

export async function preprocess(buffer: Buffer) {
  const base = sharp(buffer, { failOn: 'none', limitInputPixels: 80e6 }).rotate();
  const meta = await base.metadata();
  const srcW = meta.width || 0;
  // Jangan memperbesar tanpa perlu: interpolasi menipiskan goresan huruf. Perbesar hanya foto kecil.
  const rotatedW = (meta.orientation && meta.orientation >= 5 ? meta.height : meta.width) || srcW;
  const targetW = TARGET_W + 0 * rotatedW;
  let resized = await base.clone().resize({ width: targetW, withoutEnlargement: false, kernel: 'lanczos3' }).grayscale().normalise().raw().toBuffer({ resolveWithObject: true });
  let f = await flatten(resized.data, resized.info.width, resized.info.height);
  const noise = paperNoise(f.ratio);
  if (noise > 6) {
    // foto berderau: median menghaluskan bintik tanpa menggeser tepi huruf secara berarti
    const den = await sharp(resized.data, { raw: { width: resized.info.width, height: resized.info.height, channels: 1 } }).median(3).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
    f = await flatten(den.data, den.info.width, den.info.height);
  }
  const lm = await sharp(f.ratio, { raw: { width: f.w, height: f.h, channels: 1 } }).blur(12).raw().toBuffer();
  const hard = mapLevels(f.ratio, 'hard', lm);
  const sharp0 = await sharpness(hard, f.w, f.h);
  const angle = await estimateSkew(hard, f.w, f.h);
  const render = async (mode: Mode) => {
    const buf = mode === 'hard' ? hard : mapLevels(f.ratio, mode, lm);
    let img = sharp(buf, { raw: { width: f.w, height: f.h, channels: 1 } });
    if (Math.abs(angle) >= 0.25) img = img.rotate(angle, { background: '#ffffff' });
    // Bintik berpiksel tunggal (derau, bayangan) hilang oleh blur ringan lalu ambang. Goresan huruf tebalnya beberapa piksel dan bertahan.
    // Tanpa ini Tesseract dapat berhenti pada halaman penuh bintik karena jumlah komponen terhubung membengkak.
    if (mode !== 'gray') {
      const bin = await img.blur(0.9).threshold(150).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
      if (bin.info.channels !== 1) throw new Error('kanal citra tidak terduga');
      clearBorders(bin.data, bin.info.width, bin.info.height);
      return sharp(bin.data, { raw: { width: bin.info.width, height: bin.info.height, channels: bin.info.channels } }).toColourspace('b-w').png().toBuffer();
    }
    return img.sharpen({ sigma: 1.0 }).png().toBuffer();
  };
  return { render, angle, sourceWidth: srcW, sharpness: sharp0, noise: Math.round(noise * 10) / 10 };
}

interface TessLine { text?: string; confidence?: number; bbox?: { x0: number; y0: number } }
interface TessData { text: string; blocks?: { paragraphs?: { lines?: TessLine[] }[] }[] | null }

function collectLines(data: TessData) {
  const lines: (Line & { y: number; x: number })[] = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    const text = (l.text || '').replace(/\n/g, ' ').trim();
    if (text) lines.push({ text, conf: l.confidence ?? 0, y: l.bbox?.y0 ?? 0, x: l.bbox?.x0 ?? 0 });
  }
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines;
}

const REQUIRED = ['no_surat', 'tgl_surat', 'asal', 'perihal'];

async function readOnce(worker: Worker, png: Buffer) {
  let timer: NodeJS.Timeout | undefined;
  const t0 = Date.now();
  const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('OCR melewati batas waktu')), 30000); });
  try {
    const { data } = (await Promise.race([worker.recognize(png, {}, { blocks: true, text: true }), timeout])) as unknown as { data: TessData };
    if (process.env.OCR_DEBUG) console.log('recognize', Date.now() - t0, 'ms', data.text.split('\n').filter(Boolean).slice(0, 9).join(' | '));
    const lines = collectLines(data);
    const meanConf = lines.length ? lines.reduce((s, l) => s + l.conf, 0) / lines.length : 0;
    const parsed = parseLetter(lines);
    return { lines, meanConf, parsed, score: (REQUIRED.length - parsed.missing.length) * 100 + meanConf };
  } finally {
    clearTimeout(timer);
  }
}

/** Jalur model jarak jauh (mis. Unlimited-OCR di server GPU). Mengembalikan null bila tidak dipakai atau gagal dan cadangan aktif. */
async function viaRemote(buffer: Buffer) {
  if (config.ocr.engine !== 'remote') return null;
  try {
    const lines = await recognizeRemote(buffer);
    const parsed = parseLetter(lines);
    const warnings = ['Mesin OCR model tidak memberi skor keyakinan per isian. Periksa setiap isian sebelum menyimpan.'];
    if (parsed.missing.length) warnings.push(`Belum terbaca: ${parsed.missing.join(', ')}. Isi manual.`);
    return { text: lines.map((l) => l.text).join('\n'), lines, fields: parsed.fields, missing: parsed.missing, quality: { meanConf: 90, engine: 'remote', warnings } };
  } catch (e) {
    if (!config.ocr.fallback) throw e;
    console.warn('OCR jarak jauh gagal, memakai Tesseract:', (e as Error).message);
    return null;
  }
}

export function recognize(buffer: Buffer) {
  return serial(async () => {
    const remote = await viaRemote(buffer);
    if (remote) return remote;
    const pre = await preprocess(buffer);
    let best: (Awaited<ReturnType<typeof readOnce>> & { mode: Mode }) | null = null;
    // Coba pemetaan keras dahulu. Bila semua isian wajib terbaca dengan yakin, berhenti. Bila tidak, coba cara lain dan ambil yang terbaik.
    for (const mode of ['hard', 'soft', 'mid'] as const) {
      const worker = await getWorker();
      let res;
      try {
        res = await readOnce(worker, await pre.render(mode));
      } catch {
        workerPromise = null;
        worker.terminate().catch(() => {});
        // Waktu habis pada variasi lain: pakai hasil terbaik yang sudah ada. Bila belum ada hasil sama sekali, foto terlalu berisik atau buram.
        if (best) break;
        throw new Error('Foto terlalu berisik atau buram untuk dibaca');
      }
      if (!best || res.score > best.score) best = { ...res, mode };
      if (best.parsed.missing.length === 0 && best.meanConf >= 85) break;
    }
    if (!best) throw new Error('OCR gagal');
    const { lines, meanConf, parsed } = best;
    const warnings: string[] = [];
    if (pre.sourceWidth && pre.sourceWidth < 1000) warnings.push('Resolusi foto rendah. Ambil foto lebih dekat atau dengan kamera yang lebih baik.');
    if (meanConf < 75) warnings.push('Tingkat keyakinan pembacaan rendah. Periksa setiap isian dengan teliti atau foto ulang dengan pencahayaan merata.');
    if (pre.noise > 10 && pre.sourceWidth < 1600) warnings.push('Foto beresolusi rendah dan berderau. Hasil kemungkinan banyak keliru: foto ulang lebih dekat dengan cahaya terang dan merata.');
    if (lines.length < 6) warnings.push('Teks yang terbaca sangat sedikit. Pastikan seluruh halaman surat terlihat di foto.');
    if (parsed.missing.length) warnings.push(`Belum terbaca: ${parsed.missing.join(', ')}. Isi manual.`);
    return {
      text: lines.map((l) => l.text).join('\n'),
      lines,
      fields: parsed.fields,
      missing: parsed.missing,
      quality: { engine: 'tesseract', meanConf: Math.round(meanConf), sharpness: Math.round(pre.sharpness), sourceWidth: pre.sourceWidth, skewDegrees: Math.round(pre.angle * 100) / 100, mode: best.mode, noise: pre.noise, warnings },
    };
  });
}

export const tesseractOcr: OcrEngine = { recognize: (image) => recognize(image) as Promise<OcrResult> };
