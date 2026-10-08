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
