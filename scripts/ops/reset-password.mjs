#!/usr/bin/env node
/**
 * Atur kata sandi baru untuk satu akun, misalnya admin yang lupa kata sandinya. Semua sesi akun itu diakhiri,
 * akun diaktifkan kembali, dan kejadian dicatat di catatan kegiatan.
 *
 *   docker compose exec app sisurat reset-password admin              (kata sandi diminta, tidak tampil di layar)
 *   docker compose exec -e PASSWORD='rahasia-baru' app sisurat reset-password admin
 *
 * Format hash sama dengan aplikasi (src/server/infrastructure/security/crypto.ts): scrypt$garam$kunci.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import pg from 'pg';

const scrypt = promisify(crypto.scrypt);

async function ask(prompt) {
  if (!process.stdin.isTTY) throw new Error('Tidak ada terminal. Jalankan dengan -it, atau isi PASSWORD=...');
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  let value = '';
  for await (const chunk of process.stdin) {
    for (const ch of chunk.toString('utf8')) {
      if (ch === '\r' || ch === '\n') { process.stdin.setRawMode(false); process.stdout.write('\n'); return value; }
      if (ch === '\u0003') { process.stdout.write('\n'); process.exit(130); }
      if (ch === '\u007f') value = value.slice(0, -1);
      else value += ch;
    }
  }
  return value;
}

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('Pemakaian: sisurat reset-password <username>');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi');
  let password = process.env.PASSWORD || '';
  if (!password) {
    password = await ask(`Kata sandi baru untuk ${username}: `);
    if ((await ask('Ulangi kata sandi: ')) !== password) throw new Error('Kedua kata sandi tidak sama');
  }
  if (password.length < 8) throw new Error('Kata sandi minimal 8 karakter');

  const salt = crypto.randomBytes(16);
  const hash = `scrypt$${salt.toString('hex')}$${(await scrypt(password, salt, 64)).toString('hex')}`;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    const user = (await client.query('UPDATE users SET password_hash=$2, aktif=TRUE WHERE username=$1 RETURNING id', [username, hash])).rows[0];
    if (!user) throw new Error(`Akun "${username}" tidak ditemukan`);
    const ended = (await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id])).rowCount;
    await client.query(
      `INSERT INTO audit_log(user_id, ip, aksi, entitas, entitas_id, detail) VALUES (NULL, 'terminal', 'KATA_SANDI_DIATUR_ULANG', 'user', $1, $2)`,
      [String(user.id), { username, lewat: 'sisurat reset-password' }],
    );
    await client.query('COMMIT');
    console.log(`Kata sandi ${username} diganti. ${ended} sesi diakhiri; akun aktif.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
