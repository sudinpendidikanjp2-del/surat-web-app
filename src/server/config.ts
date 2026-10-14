import 'server-only';
import path from 'node:path';

/** Konfigurasi dari variabel lingkungan. Satu-satunya tempat process.env dibaca di sisi server. */
const env = process.env;
let extra: Record<string, unknown> = {};
try { extra = JSON.parse(env.OCR_EXTRA_JSON || '{}'); } catch { extra = {}; }

export const config = {
  databaseUrl: env.DATABASE_URL || 'postgres://surat:surat_dev@localhost:5432/surat',
  production: env.NODE_ENV === 'production',
  storageDir: env.STORAGE_DIR || path.resolve(process.cwd(), 'storage/private'),
  sessionHours: Number(env.SESSION_HOURS || 12),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB || 15) * 1024 * 1024,
  reminderEveryMs: Number(env.REMINDER_EVERY_MIN || 10) * 60 * 1000,
  jobsEnabled: env.JOBS !== 'off',
  seedPassword: env.SEED_PASSWORD,
  /**
   * Mesin OCR. Bawaan: Tesseract di dalam proses. Opsional: Gemini (Google) bila GEMINI_API_KEY diisi,
   * atau model VLM (misalnya baidu/Unlimited-OCR) di server GPU lewat vLLM atau SGLang (API kompatibel OpenAI).
   * OCR_ENGINE: auto (bawaan: Gemini bila ada kunci, selain itu Tesseract), gemini, remote, atau tesseract.
   */
  ocr: {
    engine: env.OCR_ENGINE || 'auto',
    geminiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    geminiUrl: env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
    url: env.OCR_URL || '',
    model: env.OCR_MODEL || 'Unlimited-OCR',
    prompt: env.OCR_PROMPT || 'document parsing.',
    timeoutMs: Number(env.OCR_TIMEOUT_SEC || 120) * 1000,
    extra,
    fallback: env.OCR_FALLBACK !== 'off',
  },
};
