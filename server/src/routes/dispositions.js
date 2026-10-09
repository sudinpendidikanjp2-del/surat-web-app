import { Router } from 'express';
import { one, all, tx } from '../db.js';
import { wrap, str, int, conflict, forbidden, notFound } from '../util.js';
import { audit, event, notify } from '../record.js';
import { holdsDisposition, recomputeStatus, loadLetterIn } from '../cases.js';
import { visibleLettersIn } from '../perm.js';
import { pageParams, csvList, runBulk } from '../listing.js';

const r = Router();

const SORTS = { dibuat: 'd.id', tenggat: 'd.deadline', agenda: 'li.id', status: 'd.status', prioritas: 'd.prioritas' };

function dispFilter(req) {
  const vis = visibleLettersIn(req.user, 'li', 0);
  const params = [...vis.params];
  const where = [vis.sql];
  const add = (cond, val) => { params.push(val); where.push(cond.replace(/\?/g, `$${params.length}`)); };
  if ((req.query.scope || 'saya') === 'saya') {
    params.push(req.user.id);
    const uid = `$${params.length}`;
    params.push(req.user.unit_id ?? 0);
    const unit = `$${params.length}`;
    where.push(`(d.to_user_id=${uid} OR (d.to_unit_id=${unit} AND ${req.user.role === 'pejabat' ? 'TRUE' : 'FALSE'}))`);
  }
  const st = csvList(req.query.status);
  if (st.length) add('d.status = ANY(?)', st);
  const pr = csvList(req.query.prioritas);
  if (pr.length) add('d.prioritas = ANY(?)', pr);
  if (req.query.q) add('(li.no_agenda ILIKE ? OR li.perihal ILIKE ? OR d.instruksi ILIKE ?)', `%${String(req.query.q).slice(0, 100)}%`);
  if (req.query.antrian === 'terlambat') where.push(`d.status IN ('BARU','DITERIMA') AND d.deadline < current_date`);
  return { sql: where.join(' AND '), params };
}

/** Daftar disposisi. scope=saya (yang diterima user) atau semua (yang terlihat). */
r.get('/', wrap(async (req, res) => {
  const w = dispFilter(req);
  const pg = pageParams(req.query, { sorts: SORTS, defaultSort: 'dibuat' });
  const from = `FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id JOIN users fu ON fu.id=d.from_user_id
       LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id WHERE ${w.sql}`;
  const rows = await all(
    `SELECT d.id,d.letter_in_id,d.tindakan,d.instruksi,d.deadline,d.prioritas,d.status,d.accepted_at,d.created_at,d.return_reason,
            li.no_agenda,li.perihal,li.asal,li.status AS letter_status, fu.nama AS dari, COALESCE(tu.nama, un.nama) AS kepada
       ${from} ORDER BY ${pg.orderBy}, d.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params,
  );
  const total = (await one(`SELECT count(*) AS n ${from}`, w.params)).n;
  res.json({ items: rows, total, page: pg.page, pageSize: pg.pageSize });
}));

r.get('/ids', wrap(async (req, res) => {
  const w = dispFilter(req);
  const from = `FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id WHERE ${w.sql}`;
  const total = (await one(`SELECT count(*) AS n ${from}`, w.params)).n;
  const ids = (await all(`SELECT d.id ${from} ORDER BY d.id DESC LIMIT 500`, w.params)).map((x) => x.id);
  res.json({ ids, total, terpotong: total > ids.length });
}));

async function doTerima(req, id) {
  await tx(async (db) => {
    const d = await db.one('SELECT * FROM dispositions WHERE id=$1 FOR UPDATE', [id]);
    if (!d) throw notFound();
    if (!holdsDisposition(req.user, d)) throw forbidden('Disposisi ini bukan untuk Anda');
    if (d.status !== 'BARU') throw conflict('Disposisi sudah diterima atau diproses');
    const li = await loadLetterIn(db, req.user, d.letter_in_id);
    await db.q(`UPDATE dispositions SET status='DITERIMA', accepted_at=now(), to_user_id=COALESCE(to_user_id,$2) WHERE id=$1`, [id, req.user.id]);
    await event(db, { letterInId: li.id, userId: req.user.id, tipe: 'terima', teks: `Disposisi diterima oleh ${req.user.nama}`, meta: { disposition_id: id } });
    await notify(db, [d.from_user_id], { tipe: 'disposisi', judul: 'Disposisi Anda sudah diterima', isi: `${req.user.nama} menerima disposisi ${li.no_agenda}`, link: `/surat-masuk/${li.id}` }, req.user.id);
    await recomputeStatus(db, li.id);
    await audit(db, req, 'DISPOSISI_DITERIMA', 'disposition', id, { letter: li.id });
  });
}

r.post('/bulk/terima', wrap(async (req, res) => {
  res.json(await runBulk(req.body.ids, (id) => doTerima(req, id)));
}));

r.post('/:id/terima', wrap(async (req, res) => {
  await doTerima(req, int(req.params.id, 'ID'));
  res.json({ ok: true });
}));

r.post('/:id/kembalikan', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const alasan = str(req.body.alasan, 'Alasan pengembalian', { max: 1000 });
  await tx(async (db) => {
    const d = await db.one('SELECT * FROM dispositions WHERE id=$1 FOR UPDATE', [id]);
    if (!d) throw notFound();
    if (!holdsDisposition(req.user, d)) throw forbidden('Disposisi ini bukan untuk Anda');
    if (!['BARU', 'DITERIMA'].includes(d.status)) throw conflict('Disposisi tidak dapat dikembalikan pada status ini');
    const li = await loadLetterIn(db, req.user, d.letter_in_id);
    const open = await db.one(`SELECT count(*) AS n FROM tasks WHERE disposition_id=$1 AND status NOT IN ('SELESAI','DIBATALKAN')`, [id]);
    if (open.n > 0) throw conflict('Masih ada tugas terbuka pada disposisi ini. Selesaikan atau batalkan dahulu');
    await db.q(`UPDATE dispositions SET status='DIKEMBALIKAN', return_reason=$2 WHERE id=$1`, [id, alasan]);
    // Jika induknya sudah diteruskan, hidupkan kembali agar pemberi dapat bertindak.
    if (d.parent_id) await db.q(`UPDATE dispositions SET status = CASE WHEN accepted_at IS NULL THEN 'BARU' ELSE 'DITERIMA' END WHERE id=$1 AND status='DITERUSKAN'`, [d.parent_id]);
    await event(db, { letterInId: li.id, userId: req.user.id, tipe: 'kembali', teks: `Disposisi dikembalikan oleh ${req.user.nama}: ${alasan}`, meta: { disposition_id: id } });
    await notify(db, [d.from_user_id], { tipe: 'disposisi', judul: 'Disposisi dikembalikan', isi: `${li.no_agenda}: ${alasan}`, link: `/surat-masuk/${li.id}` }, req.user.id);
    await recomputeStatus(db, li.id);
    await audit(db, req, 'DISPOSISI_DIKEMBALIKAN', 'disposition', id, { alasan });
  });
  res.json({ ok: true });
}));

export default r;
