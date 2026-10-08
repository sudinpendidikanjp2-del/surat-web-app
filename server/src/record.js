import { q } from './db.js';

/** Catat aktivitas penting. Dipanggil dengan `db` transaksi agar atomik dengan perubahan datanya. */
export function audit(db, req, aksi, entitas, entitasId, detail = {}) {
  return (db || { q }).q(
    `INSERT INTO audit_log(user_id,aksi,entitas,entitas_id,detail,ip) VALUES($1,$2,$3,$4,$5,$6)`,
    [req.user?.id ?? null, aksi, entitas, entitasId == null ? null : String(entitasId), detail, req.ip],
  );
}

/** Tambah entri timeline. Timeline tidak punya jalur ubah atau hapus. */
export function event(db, { letterInId = null, letterOutId = null, userId, tipe, teks, meta = {} }) {
  return (db || { q }).q(
    `INSERT INTO events(letter_in_id,letter_out_id,user_id,tipe,teks,meta) VALUES($1,$2,$3,$4,$5,$6)`,
    [letterInId, letterOutId, userId ?? null, tipe, teks, meta],
  );
}

export async function notify(db, userIds, { tipe, judul, isi = null, link = null, dedupe = null }, exceptUserId = null) {
  const targets = [...new Set(userIds.filter((id) => id && id !== exceptUserId))];
  for (const uid of targets) {
    await (db || { q }).q(
      `INSERT INTO notifications(user_id,tipe,judul,isi,link,dedupe_key) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT (dedupe_key) DO NOTHING`,
      [uid, tipe, judul, isi, link, dedupe ? `${dedupe}:${uid}` : null],
    );
  }
}

/** Nomor urut atomik per kunci. Aman terhadap permintaan bersamaan. */
export async function nextSeq(db, key) {
  const r = await db.one(
    `INSERT INTO sequences(key,last) VALUES($1,1)
     ON CONFLICT (key) DO UPDATE SET last = sequences.last + 1 RETURNING last`,
    [key],
  );
  return r.last;
}

export async function getSetting(db, key, fallback = null) {
  const r = await (db || { one: (t, p) => q(t, p).then((x) => x.rows[0]) }).one(`SELECT value FROM settings WHERE key=$1`, [key]);
  return r ? r.value : fallback;
}
