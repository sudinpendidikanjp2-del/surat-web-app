import { config } from '@/server/config';
import type { OcrEngine, OcrResult } from '@/server/application/ports';
import { recognizeGemini } from './gemini';
import { isPdf, renderFirstPage } from './pdf-raster';
import { recognize as recognizeLocal } from './tesseract';

/** Gemini dipakai bila diminta tegas, atau pada mode auto bila kuncinya tersedia. */
export const geminiEnabled = () => {
  const e = config.ocr.engine;
  return e === 'gemini' || ((e === 'auto' || e === '') && !!config.ocr.geminiKey);
};

/**
 * Pintu masuk OCR. PDF diubah dahulu menjadi gambar halaman pertama (dikembalikan juga sebagai pratinjau),
 * lalu dibaca Gemini bila aktif. Bila Gemini gagal dan cadangan aktif, dibaca Tesseract (atau mesin jarak jauh).
 */
export async function recognizeLetter(input: Buffer): Promise<OcrResult> {
  let image = input;
  let preview: string | undefined;
  if (isPdf(input)) {
    image = await renderFirstPage(input);
    preview = `data:image/png;base64,${image.toString('base64')}`;
  }
  const notes: string[] = [];
  if (geminiEnabled()) {
    try {
      const r = await recognizeGemini(image);
      return preview ? { ...r, preview } : r;
    } catch (e) {
      if (!config.ocr.fallback) throw e;
      console.warn('OCR Gemini gagal, memakai Tesseract:', (e as Error).message);
      notes.push('Gemini tidak dapat dipakai, memakai pembaca bawaan. Periksa setiap isian dengan teliti.');
    }
  }
  const r = (await recognizeLocal(image)) as OcrResult;
  if (notes.length) r.quality = { ...r.quality, warnings: [...notes, ...r.quality.warnings] };
  return preview ? { ...r, preview } : r;
}

export const ocrEngine: OcrEngine = { recognize: recognizeLetter };
