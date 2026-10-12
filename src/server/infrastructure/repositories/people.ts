import type { Actor } from '@/domain/roles';
import type { SessionsRepo, SettingsRepo, UnitsRepo, UsersRepo } from '@/server/application/ports';
import type { Db } from '../db/client';
import { pageParams, Where } from '../db/visibility';

const ACTOR_COLS = 'u.id,u.username,u.nama,u.nip,u.jabatan,u.role,u.unit_id,u.email,un.nama AS unit_nama';

export const usersRepo = (db: Db): UsersRepo => ({
  findForLogin: (username) => db.one(`SELECT ${ACTOR_COLS},u.aktif,u.password_hash FROM users u LEFT JOIN units un ON un.id=u.unit_id WHERE u.username=$1`, [username]),
  passwordHash: async (id) => (await db.one<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1', [id]))?.password_hash ?? null,
  setPasswordHash: async (id, hash) => { await db.q('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, id]); },
  name: async (id) => (await db.one<{ nama: string }>('SELECT nama FROM users WHERE id=$1', [id]))?.nama ?? null,
  signer: (id) => db.one('SELECT nama,jabatan,nip,pangkat FROM users WHERE id=$1', [id]),
  isActive: async (id) => Boolean(await db.one('SELECT 1 FROM users WHERE id=$1 AND aktif', [id])),
  isSigner: async (id) => Boolean(await db.one(`SELECT 1 FROM users WHERE id=$1 AND aktif AND role IN ('pimpinan','pejabat','superadmin')`, [id])),
  activeIdsByRole: async (roles) => (await db.all<{ id: number }>('SELECT id FROM users WHERE role = ANY($1) AND aktif', [roles])).map((u) => u.id),
  async unitRecipients(unitId) {
    const heads = await db.all<{ id: number }>(`SELECT id FROM users WHERE unit_id=$1 AND aktif AND role='pejabat'`, [unitId]);
    if (heads.length) return heads.map((x) => x.id);
    return (await db.all<{ id: number }>('SELECT id FROM users WHERE unit_id=$1 AND aktif', [unitId])).map((x) => x.id);
  },
  byUsernames: (names) => db.all('SELECT id,role,unit_id FROM users WHERE username = ANY($1) AND aktif', [names]),
  options: () => db.all(`SELECT u.id,u.username,u.nama,u.jabatan,u.role,u.unit_id,u.nip,u.pangkat,un.nama AS unit_nama
                           FROM users u LEFT JOIN units un ON un.id=u.unit_id WHERE u.aktif ORDER BY u.nama`),
  async list(f, q) {
    const w = userWhere(f);
    const pg = pageParams(q, { sorts: { nama: 'u.nama', username: 'u.username', role: 'u.role', unit: 'un.nama' }, defaultSort: 'nama', defaultDir: 'asc' });
    const from = `FROM users u LEFT JOIN units un ON un.id=u.unit_id WHERE ${w.sql}`;
    const items = await db.all(`SELECT u.id,u.username,u.nama,u.nip,u.pangkat,u.jabatan,u.email,u.role,u.unit_id,u.aktif,un.nama AS unit_nama ${from}
                                ORDER BY u.aktif DESC, ${pg.orderBy} LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n ${from}`, w.params))!.n;
    return { items: items as never, total, page: pg.page, pageSize: pg.pageSize };
  },
  async ids(f) {
    const w = userWhere(f);
    const from = `FROM users u WHERE ${w.sql}`;
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n ${from}`, w.params))!.n;
    const ids = (await db.all<{ id: number }>(`SELECT u.id ${from} ORDER BY u.id LIMIT 500`, w.params)).map((x) => x.id);
    return { ids, total, terpotong: total > ids.length };
  },
  usernameExists: async (username) => Boolean(await db.one('SELECT 1 FROM users WHERE username=$1', [username])),
  insert: async (u) => (await db.one<{ id: number }>(
    `INSERT INTO users(username,nama,nip,pangkat,jabatan,email,role,unit_id,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [u.username, u.nama, u.nip, u.pangkat, u.jabatan, u.email, u.role, u.unit_id, u.password_hash],
  ))!.id,
  update: async (id, u) => Boolean(await db.one(
    'UPDATE users SET nama=$1,nip=$2,pangkat=$3,jabatan=$4,email=$5,role=$6,unit_id=$7,aktif=$8 WHERE id=$9 RETURNING id',
    [u.nama, u.nip, u.pangkat, u.jabatan, u.email, u.role, u.unit_id, u.aktif, id],
  )),
  setActive: async (id, aktif) => Boolean(await db.one('UPDATE users SET aktif=$1 WHERE id=$2 RETURNING id', [aktif, id])),
  count: async () => (await db.one<{ n: number }>('SELECT count(*) AS n FROM users'))!.n,
  idByUsername: async (username) => (await db.one<{ id: number }>('SELECT id FROM users WHERE username=$1', [username]))?.id ?? null,
});

function userWhere(f: { roles: string[]; unit: number | null; aktif: boolean | null; q?: string }) {
  const w = new Where({ sql: 'TRUE', params: [] });
  if (f.roles.length) w.add('u.role = ANY(?)', f.roles);
  if (f.unit) w.add('u.unit_id = ?', f.unit);
  if (f.aktif === true) w.raw('u.aktif');
  if (f.aktif === false) w.raw('NOT u.aktif');
  if (f.q) w.add('(u.nama ILIKE ? OR u.username ILIKE ? OR u.jabatan ILIKE ?)', `%${f.q}%`);
  return w;
}

export const sessionsRepo = (db: Db): SessionsRepo => ({
  create: async (hash, userId, hours) => {
    await db.q(`INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2, now() + ($3 || ' hours')::interval)`, [hash, userId, String(hours)]);
  },
  findActor: (hash) => db.one<Actor>(
    `SELECT ${ACTOR_COLS} FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN units un ON un.id=u.unit_id
      WHERE s.token_hash=$1 AND s.expires_at > now() AND u.aktif`, [hash],
  ),
  delete: async (hash) => { await db.q('DELETE FROM sessions WHERE token_hash=$1', [hash]); },
  deleteOthers: async (userId, keep) => { await db.q('DELETE FROM sessions WHERE user_id=$1 AND token_hash <> $2', [userId, keep]); },
  deleteForUser: async (userId) => { await db.q('DELETE FROM sessions WHERE user_id=$1', [userId]); },
  deleteExpired: async () => { await db.q('DELETE FROM sessions WHERE expires_at < now()'); },
});

export const unitsRepo = (db: Db): UnitsRepo => ({
  list: () => db.all('SELECT un.*, (SELECT count(*) FROM users u WHERE u.unit_id=un.id AND u.aktif) AS jumlah_pengguna FROM units un ORDER BY un.nama'),
  isActive: async (id) => Boolean(await db.one('SELECT 1 FROM units WHERE id=$1 AND aktif', [id])),
  name: async (id) => (await db.one<{ nama: string }>('SELECT nama FROM units WHERE id=$1', [id]))?.nama ?? '',
  codeExists: async (kode) => Boolean(await db.one('SELECT 1 FROM units WHERE kode=$1', [kode])),
  insert: async (nama, kode) => (await db.one<{ id: number }>('INSERT INTO units(nama,kode) VALUES($1,$2) RETURNING id', [nama, kode]))!.id,
  update: async (id, nama, aktif) => Boolean(await db.one('UPDATE units SET nama=$1, aktif=$2 WHERE id=$3 RETURNING id', [nama, aktif, id])),
  ensure: async (kode, nama) => { await db.q('INSERT INTO units(kode,nama) VALUES($1,$2) ON CONFLICT (kode) DO NOTHING', [kode, nama]); },
  idByCode: async (kode) => (await db.one<{ id: number }>('SELECT id FROM units WHERE kode=$1', [kode]))?.id ?? null,
});

export const settingsRepo = (db: Db): SettingsRepo => ({
  get: async <T,>(key: string) => ((await db.one<{ value: T }>('SELECT value FROM settings WHERE key=$1', [key]))?.value ?? null),
  set: async (key, value) => { await db.q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2', [key, value]); },
  ensure: async (key, value) => { await db.q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [key, value]); },
  all: async () => Object.fromEntries((await db.all<{ key: string; value: unknown }>('SELECT key,value FROM settings')).map((x) => [x.key, x.value])),
});
