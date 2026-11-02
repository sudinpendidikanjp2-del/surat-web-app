import { config } from '@/server/config';
import { getPool } from '@/server/infrastructure/db/client';

/** Siap melayani: database terjangkau. Tidak mengungkap detail galat, versi, atau konfigurasi. */
export async function GET() {
  try {
    await getPool(config.databaseUrl).query('SELECT 1');
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'error', error: 'DATABASE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const dynamic = 'force-dynamic';
