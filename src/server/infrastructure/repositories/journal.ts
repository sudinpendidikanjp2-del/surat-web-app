import type { JournalRepo } from '@/server/application/ports';
import type { Db } from '../db/client';

/** Audit, riwayat, notifikasi, dan nomor urut. Audit dan riwayat dikunci trigger database dari ubah/hapus. */
export const journalRepo = (db: Db): JournalRepo => ({
  async audit(e) {
    await db.q('INSERT INTO audit_log(user_id,aksi,entitas,entitas_id,detail,ip) VALUES($1,$2,$3,$4,$5,$6)',
      [e.userId, e.aksi, e.entitas, e.entitasId == null ? null : String(e.entitasId), e.detail, e.ip]);
  },
  async event(e) {
    await db.q('INSERT INTO events(letter_in_id,letter_out_id,user_id,tipe,teks,meta) VALUES($1,$2,$3,$4,$5,$6)',
      [e.letterInId ?? null, e.letterOutId ?? null, e.userId, e.tipe, e.teks, e.meta ?? {}]);
  },
  async notify(userIds, n, exceptUserId = null) {
    const targets = [...new Set(userIds.filter((id) => id && id !== exceptUserId))];
    for (const uid of targets) {
      await db.q(
        `INSERT INTO notifications(user_id,tipe,judul,isi,link,dedupe_key) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (dedupe_key) DO NOTHING`,
        [uid, n.tipe, n.judul, n.isi ?? null, n.link ?? null, n.dedupe ? `${n.dedupe}:${uid}` : null],
      );
    }
  },
  nextSeq: async (key) => (await db.one<{ last: number }>(
    `INSERT INTO sequences(key,last) VALUES($1,1) ON CONFLICT (key) DO UPDATE SET last = sequences.last + 1 RETURNING last`, [key],
  ))!.last,
  async auditPage(f) {
    const params: unknown[] = [];
    const where: string[] = [];
    if (f.aksi) { params.push(f.aksi); where.push(`a.aksi = $${params.length}`); }
    if (f.user) { params.push(f.user); where.push(`a.user_id = $${params.length}`); }
    if (f.q) { params.push(`%${f.q}%`); where.push(`(a.entitas_id ILIKE $${params.length} OR a.detail::text ILIKE $${params.length})`); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = await db.all(`SELECT a.id,a.aksi,a.entitas,a.entitas_id,a.detail,a.ip,a.created_at,u.nama AS user_nama
                                  FROM audit_log a LEFT JOIN users u ON u.id=a.user_id ${w} ORDER BY a.id DESC LIMIT ${f.limit} OFFSET ${f.offset}`, params);
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n FROM audit_log a ${w}`, params))!.n;
    return { items: items as never, total };
  },
  async notifications(userId, f) {
    const only = f.unreadOnly ? 'AND NOT dibaca' : '';
    const items = await db.all(`SELECT id,tipe,judul,isi,link,dibaca,created_at FROM notifications WHERE user_id=$1 ${only}
                                ORDER BY id DESC LIMIT ${f.pageSize} OFFSET ${(f.page - 1) * f.pageSize}`, [userId]);
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n FROM notifications WHERE user_id=$1 ${only}`, [userId]))!.n;
    const unread = (await db.one<{ n: number }>('SELECT count(*) AS n FROM notifications WHERE user_id=$1 AND NOT dibaca', [userId]))!.n;
    return { items: items as never, total, unread, page: f.page, pageSize: f.pageSize };
  },
  async markRead(userId, ids) {
    if (ids === 'all') await db.q('UPDATE notifications SET dibaca=TRUE WHERE user_id=$1', [userId]);
    else if (ids.length) await db.q('UPDATE notifications SET dibaca=TRUE WHERE user_id=$1 AND id = ANY($2::bigint[])', [userId, ids]);
  },
});
