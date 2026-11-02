import { config } from '@/server/config';
import { getPool } from '@/server/infrastructure/db/client';

/** Siap melayani: database terjangkau. */
export async function GET() {
  try {
    await getPool(config.databaseUrl).query('SELECT 1');
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
export const dynamic = 'force-dynamic';
