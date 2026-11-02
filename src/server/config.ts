import 'server-only';
import { parseConfig } from './env';

/** Konfigurasi dari variabel lingkungan. Satu-satunya tempat process.env dibaca di sisi server (aturan ada di env.ts). */
const parsed = parseConfig(process.env);

export const config = parsed.config;

/**
 * Dipanggil sekali saat server menyala (boot.ts), bukan saat build. Masalah konfigurasi menghentikan server
 * dengan daftar yang jelas; peringatan hanya dicatat.
 */
export function assertConfig() {
  for (const w of parsed.warnings) console.warn(`Peringatan konfigurasi: ${w}`);
  if (parsed.problems.length) {
    throw new Error(`Konfigurasi environment tidak valid:\n${parsed.problems.map((p) => `- ${p}`).join('\n')}`);
  }
}
