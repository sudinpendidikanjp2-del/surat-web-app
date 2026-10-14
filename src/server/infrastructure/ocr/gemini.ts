import { config } from '@/server/config';
import type { OcrResult } from '@/server/application/ports';
import { cleanNomor, needsReview, normalizeSifat, parseDate } from './parse-letter';

const mimeOf = (b: Buffer) => (b[0] === 0x89 ? 'image/png' : b.subarray(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/jpeg');

/** Isian yang diminta dari model, sama dengan keluaran parseLetter. */
const FIELDS = ['no_surat', 'tgl_surat', 'perihal', 'sifat', 'lampiran', 'instansi', 'alamat', 'asal'] as const;
const REQUIRED = ['no_surat', 'tgl_surat', 'asal', 'perihal'];

export const GEMINI_PROMPT = [
  'Anda membaca foto halaman pertama surat dinas berbahasa Indonesia.',
  'Ambil isian berikut persis seperti tertulis di surat. Jangan menebak: bila tidak ada atau tidak terbaca, isi value dengan string kosong dan confidence 0.',
  '- no_surat: nomor surat (setelah label Nomor).',
  '- tgl_surat: tanggal surat dalam format YYYY-MM-DD.',
  '- perihal: isi perihal atau hal, tanpa label.',
  '- sifat: salah satu dari Biasa, Segera, Penting, Rahasia.',
  '- lampiran: isi lampiran tanpa label. Bila tertulis "-" atau tidak ada lampiran, isi "-".',
  '- instansi: nama instansi pengirim pada kop surat (baris terakhir kop sebelum alamat).',
  '- alamat: alamat pada kop surat, tanpa nomor telepon, email, atau situs.',
  '- asal: jabatan penanda tangan surat (mis. Kepala Sekolah), tanpa nama orangnya.',
  'confidence: seberapa yakin Anda bahwa value benar, bilangan bulat 0 sampai 100.',
  'text: seluruh teks halaman, baris demi baris.',
].join('\n');

const fieldSchema = {
  type: 'OBJECT',
  properties: { value: { type: 'STRING' }, confidence: { type: 'INTEGER' } },
  required: ['value', 'confidence'],
};
export const GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: { ...Object.fromEntries(FIELDS.map((f) => [f, fieldSchema])), text: { type: 'STRING' } },
  required: [...FIELDS, 'text'],
};

interface GeminiField { value?: unknown; confidence?: unknown }

/** Normalisasi satu isian dari model memakai aturan yang sama dengan penguraian Tesseract. */
function normalize(field: string, raw: string): string | null {
  const v = raw.replace(/\s+/g, ' ').trim();
  if (field === 'lampiran') return /^[-–_.]*$/.test(v) ? '' : v.replace(/[.,;:]+$/, '');
  if (!v) return null;
  if (field === 'tgl_surat') {
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12 && Number(iso[3]) >= 1 && Number(iso[3]) <= 31) return v;
    return parseDate(v);
  }
  if (field === 'sifat') return normalizeSifat(v);
  if (field === 'no_surat') return cleanNomor(v);
  return v.replace(/[,;]+$/, '');
}

/** Ubah JSON jawaban model menjadi bentuk OcrResult. Diekspor agar dapat diuji tanpa jaringan. */
export function mapGemini(data: Record<string, unknown>): OcrResult {
  const fields: OcrResult['fields'] = {};
  for (const f of FIELDS) {
    const item = data[f] as GeminiField | string | undefined;
    const rawValue = typeof item === 'string' ? item : item?.value;
    if (typeof rawValue !== 'string') continue;
    const value = normalize(f, rawValue);
    if (value == null) continue;
    const c = Number(typeof item === 'object' ? item?.confidence : NaN);
    // Model tanpa skor dianggap kurang yakin agar isiannya ditandai untuk diperiksa.
    const conf = Number.isFinite(c) ? Math.round(Math.min(100, Math.max(0, c))) : 70;
    if (f !== 'lampiran' && conf === 0) continue;
    fields[f] = { value, conf, review: needsReview(f, conf) };
  }
  const missing = REQUIRED.filter((k) => !fields[k]);
  const confs = Object.values(fields).map((x) => x.conf);
  const meanConf = confs.length ? Math.round(confs.reduce((a, b) => a + b, 0) / confs.length) : 0;
  const warnings: string[] = [];
  if (missing.length) warnings.push(`Belum terbaca: ${missing.join(', ')}. Isi manual.`);
  return { fields, missing, quality: { engine: 'gemini', meanConf, warnings }, text: typeof data.text === 'string' ? data.text : '' };
}

/** Ambil JSON dari teks jawaban. Model kadang membungkusnya dengan pagar kode Markdown. */
function parseJson(text: string): Record<string, unknown> {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const obj = JSON.parse(t);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Jawaban Gemini bukan objek JSON');
  return obj as Record<string, unknown>;
}

/**
 * Baca foto surat dengan Gemini lewat REST generateContent. Foto dikirim ke Google.
 * Kunci API hanya dikirim di header, tidak pernah di URL atau log.
 */
export async function recognizeGemini(image: Buffer): Promise<OcrResult> {
  const { geminiKey, geminiModel, geminiUrl, timeoutMs } = config.ocr;
  if (!geminiKey) throw new Error('GEMINI_API_KEY belum diatur');
  const body = {
    contents: [{ role: 'user', parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mimeOf(image), data: image.toString('base64') } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: GEMINI_SCHEMA },
  };
  const res = await fetch(`${geminiUrl.replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Gemini menjawab ${res.status}`);
  const json = await res.json();
  const cand = json?.candidates?.[0];
  const text = (cand?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('');
  if (!text) throw new Error(`Gemini tidak mengembalikan teks${cand?.finishReason ? ` (${cand.finishReason})` : ''}`);
  return mapGemini(parseJson(text));
}
