import { config } from '@/server/config';
import type { Line } from './parse-letter';

const mimeOf = (b: Buffer) => (b[0] === 0x89 ? 'image/png' : b.subarray(0, 4).toString() === 'RIFF' ? 'image/webp' : 'image/jpeg');

/** Ubah keluaran Markdown model parsing dokumen menjadi baris teks biasa. Sel tabel digabung agar "Nomor : ..." tetap satu baris. */
export function markdownToLines(md: unknown): string[] {
  return String(md || '')
    .replace(/<\|[^|]*\|>/g, ' ')            // token khusus
    .replace(/<[^>]+>/g, ' ')                // sisa tag HTML
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[#>*\-]+\s+/, '').replace(/\*\*|__|`/g, '').replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/, '').replace(/\s*\|\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Kirim foto ke server model OCR (API kompatibel OpenAI, mis. vLLM atau SGLang menjalankan baidu/Unlimited-OCR).
 * Model ini tidak mengembalikan skor keyakinan per baris, jadi keyakinan diberi nilai tetap dan pemeriksaan
 * manual oleh pengguna tetap wajib.
 */
export async function recognizeRemote(buffer: Buffer): Promise<Line[]> {
  const { url, model, prompt, timeoutMs, extra } = config.ocr;
  if (!url) throw new Error('OCR_URL belum diatur');
  const body = {
    model,
    temperature: 0,
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${mimeOf(buffer)};base64,${buffer.toString('base64')}` } },
    ] }],
    ...extra,
  };
  const res = await fetch(`${url.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Server OCR menjawab ${res.status}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content;
  if (!text) throw new Error('Server OCR tidak mengembalikan teks');
  return markdownToLines(text).map((t, i) => ({ text: t, conf: 90, y: i, x: 0 }));
}
