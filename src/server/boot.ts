import 'server-only';
import { ensureBaseData } from './application/bootstrap';
import { runReminders } from './application/reminders';
import { config } from './config';
import { deps } from './container';
import { getPool } from './infrastructure/db/client';
import { migrate } from './infrastructure/db/schema';
import { stopOcr } from './infrastructure/ocr/tesseract';

/** Dipanggil sekali saat server Next.js menyala (instrumentation.ts): skema, data dasar, pengingat berkala. */
export async function boot() {
  const pool = getPool(config.databaseUrl);
  await migrate(pool);
  await ensureBaseData(deps(), { production: config.production, seedPassword: config.seedPassword });
  if (config.jobsEnabled) {
    const tick = () => runReminders(deps()).catch((e) => console.error('Pengingat gagal:', e.message));
    setTimeout(tick, 5000).unref();
    setInterval(tick, config.reminderEveryMs).unref();
  }
  const stop = () => {
    setTimeout(() => process.exit(1), 15_000).unref(); // paksa keluar bila koneksi menggantung
    stopOcr().then(() => pool.end()).finally(() => process.exit(0));
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
