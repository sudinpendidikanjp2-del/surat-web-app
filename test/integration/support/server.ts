import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import pg from 'pg';

/**
 * Uji integrasi berjalan melawan server Next.js sungguhan (hasil `npm run build`), dengan database
 * yang dibuat ulang setiap kali agar hasilnya deterministik.
 */
const freePort = () => new Promise<number>((resolve) => {
  const s = net.createServer();
  s.listen(0, () => { const { port } = s.address() as net.AddressInfo; s.close(() => resolve(port)); });
});

export async function recreateDatabase(url: string) {
  const admin = new pg.Client({ connectionString: url.replace(/\/[^/]+$/, '/postgres') });
  await admin.connect();
  const name = new URL(url).pathname.slice(1);
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
}

export interface TestServer { url: string; pool: pg.Pool; stop: () => Promise<void> }

export async function startServer(dbName: string, extraEnv: Record<string, string> = {}): Promise<TestServer> {
  const base = process.env.TEST_DATABASE_URL || 'postgres://surat:surat_dev@localhost:5432/surat_test';
  const databaseUrl = base.replace(/\/[^/]+$/, `/${dbName}`);
  await recreateDatabase(databaseUrl);
  const port = await freePort();
  const storage = `/tmp/surat-test-storage-${dbName}-${process.pid}`;
  // Proses uji juga memakai composition root (misalnya untuk menjalankan pengingat), jadi env-nya disamakan.
  Object.assign(process.env, { DATABASE_URL: databaseUrl, STORAGE_DIR: storage, JOBS: 'off' });
  const child: ChildProcess = spawn(process.execPath, [path.resolve('node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
    env: { ...process.env, DATABASE_URL: databaseUrl, STORAGE_DIR: storage, JOBS: 'off', NODE_ENV: 'production', SEED_PASSWORD: 'surat12345', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout?.on('data', (c) => { log += c; });
  child.stderr?.on('data', (c) => { log += c; });
  const url = `http://localhost:${port}`;
  const deadline = Date.now() + 90_000;
  for (;;) {
    if (child.exitCode != null) throw new Error(`Server berhenti:\n${log}`);
    try {
      // /api/auth/me memicu instrumentation (migrasi + data dasar) selesai lebih dulu.
      const r = await fetch(`${url}/api/auth/me`);
      if (r.ok) break;
    } catch { /* belum siap */ }
    if (Date.now() > deadline) throw new Error(`Server tidak siap dalam 90 detik:\n${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 3 });
  return {
    url, pool,
    stop: async () => {
      await pool.end();
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
      if (process.env.TEST_SERVER_LOG) console.log(log);
    },
  };
}
