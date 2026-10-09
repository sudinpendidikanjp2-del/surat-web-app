import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://surat:surat_dev@localhost:5432/surat',
  production: process.env.NODE_ENV === 'production',
  storageDir: process.env.STORAGE_DIR || path.resolve(here, '../../storage/private'),
  clientDist: path.resolve(here, '../../client/dist'),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 15) * 1024 * 1024,
  reminderEveryMs: Number(process.env.REMINDER_EVERY_MIN || 10) * 60 * 1000,
};

/**
 * Mesin OCR. Bawaan: Tesseract di dalam proses (tanpa GPU). Opsional: model VLM seperti baidu/Unlimited-OCR
 * yang dijalankan terpisah di server GPU lewat vLLM atau SGLang (API kompatibel OpenAI).
 */
config.ocr = {
  engine: process.env.OCR_ENGINE || 'tesseract', // 'tesseract' atau 'remote'
  url: process.env.OCR_URL || '',                 // contoh: http://gpu-host:10000
  model: process.env.OCR_MODEL || 'Unlimited-OCR',
  prompt: process.env.OCR_PROMPT || 'document parsing.',
  timeoutMs: Number(process.env.OCR_TIMEOUT_SEC || 120) * 1000,
  extra: (() => { try { return JSON.parse(process.env.OCR_EXTRA_JSON || '{}'); } catch { return {}; } })(),
  fallback: process.env.OCR_FALLBACK !== 'off',
};
