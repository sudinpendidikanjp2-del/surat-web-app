import pg from 'pg';

// Kolom DATE dikembalikan sebagai 'YYYY-MM-DD', bukan Date, agar tidak bergeser zona waktu.
pg.types.setTypeParser(1082, (v) => v);
// COUNT/SUM bigint menjadi number.
pg.types.setTypeParser(20, (v) => Number(v));

/** Pelaksana kueri. Repositori hanya mengenal ini, bukan pool atau client pg. */
export interface Db {
  q(text: string, params?: unknown[]): Promise<{ rowCount: number | null }>;
  one<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T | null>; // eslint-disable-line @typescript-eslint/no-explicit-any
  all<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Queryable = pg.Pool | pg.PoolClient;

export const executor = (c: Queryable): Db => ({
  q: (t, p) => c.query(t, p),
  one: async (t, p) => ((await c.query(t, p)).rows[0] as never) ?? null,
  all: async (t, p) => (await c.query(t, p)).rows as never,
});

// Satu pool per proses. Disimpan di globalThis agar hot reload di mode dev tidak membuat pool baru terus.
const g = globalThis as unknown as { __suratPool?: pg.Pool };
export function getPool(url: string) {
  if (!g.__suratPool) g.__suratPool = new pg.Pool({ connectionString: url, max: 10 });
  return g.__suratPool;
}

export async function transaction<T>(pool: pg.Pool, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(executor(client));
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
