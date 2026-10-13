#!/usr/bin/env node
/**
 * PostgreSQL lokal tanpa Docker dan tanpa memasang PostgreSQL sendiri.
 * Biner PostgreSQL 16 datang dari paket npm `embedded-postgres`; data disimpan di `.data/postgres`.
 *
 *   npm run db           database saja (biarkan jendela ini terbuka, berhenti dengan Ctrl+C)
 *   npm run dev:local    database lalu aplikasi (`next dev`) dalam satu perintah
 *
 * Alamatnya sama dengan bawaan aplikasi: postgres://surat:surat_dev@localhost:5432/surat
 * Database `surat_test` untuk `npm test` ikut dibuat.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.data', 'postgres');
const port = Number(process.env.DEV_DB_PORT || 5432);
const withApp = process.argv.includes('--with-app');

const portFree = () => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(port, '127.0.0.1');
});

if (!(await portFree())) {
  console.error(`Port ${port} sudah dipakai. Mungkin PostgreSQL lain (atau Docker) sedang berjalan.
- Bila itu database untuk aplikasi ini, cukup jalankan: npm run dev
- Atau pakai port lain: DEV_DB_PORT=5433 npm run db, lalu ubah port di DATABASE_URL pada .env.local`);
  process.exit(1);
}

let EmbeddedPostgres;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
} catch {
  console.error('Paket embedded-postgres belum terpasang untuk sistem ini. Jalankan: npm install');
  process.exit(1);
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  port,
  user: 'surat',
  password: 'surat_dev',
  persistent: true,
  // initdb menolak berjalan sebagai root; paket ini lalu membuat pengguna sistem `postgres`.
  createPostgresUser: typeof process.getuid === 'function' && process.getuid() === 0,
  onLog: () => {},
  onError: (e) => console.error(String(e).trim()),
});

const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) {
  console.log('Menyiapkan database pertama kali (sekali saja)…');
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient('postgres', '127.0.0.1');
await client.connect();
const existing = new Set((await client.query('SELECT datname FROM pg_database')).rows.map((r) => r.datname));
for (const name of ['surat', 'surat_test']) if (!existing.has(name)) await client.query(`CREATE DATABASE ${name}`);
await client.end();

console.log(`PostgreSQL siap di postgres://surat:surat_dev@localhost:${port}/surat (data di .data/postgres)`);

let app = null;
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (app && app.exitCode == null) app.kill('SIGINT');
  console.log('\nMenghentikan database…');
  await pg.stop().catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

if (withApp) {
  const next = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
  app = spawn(process.execPath, [next, 'dev'], { cwd: root, stdio: 'inherit', env: process.env });
  app.on('exit', (code) => stop(code ?? 0));
} else {
  console.log('Biarkan jendela ini terbuka. Di jendela lain jalankan: npm run dev   (berhenti: Ctrl+C)');
}
