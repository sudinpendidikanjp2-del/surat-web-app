import { Router } from 'express';
import { one, all, tx } from '../db.js';
import { wrap, str, oneOf, int, dateStr, bad, forbidden, notFound, conflict } from '../util.js';
import { audit, event, notify } from '../record.js';
import { upload } from '../storage.js';
import { saveAttachment, ATT_SELECT } from '../attachments.js';
import { recomputeStatus, loadLetterIn } from '../cases.js';
import { visibleLettersIn, is } from '../perm.js';
import { slaIndicator } from '../sla.js';

const r = Router();
export const TASK_STATUS = {
  BELUM_DIMULAI: 'Belum dimulai', DITERIMA: 'Diterima', DIPROSES: 'Sedang diproses', MENUNGGU_DATA: 'Menunggu data',
  MENUNGGU_KONFIRMASI: 'Menunggu konfirmasi', MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan', SELESAI: 'Selesai', DIBATALKAN: 'Dibatalkan',
};
const PRIORITAS = ['Rendah', 'Normal', 'Tinggi', 'Mendesak'];

const decorate = (t) => ({
  ...t,
  statusLabel: TASK_STATUS[t.status],
  sla: slaIndicator(t.deadline, new Date(), ['SELESAI', 'DIBATALKAN'].includes(t.status)),
});

/** scope: saya (PIC), diberikan (saya pemberi), semua (terlihat) */
r.get('/', wrap(async (req, res) => {
  const vis = visibleLettersIn(req.user, 'li', 0);
  const params = [...vis.params];
  const where = [vis.sql];
  const scope = ['saya', 'diberikan', 'semua'].includes(req.query.scope) ? req.query.scope : 'saya';
  if (scope === 'saya') { params.push(req.user.id); where.push(`t.pic_user_id=$${params.length}`); }
  if (scope === 'diberikan') { params.push(req.user.id); where.push(`t.assigner_id=$${params.length}`); }
  if (req.query.status) { params.push(String(req.query.status)); where.push(`t.status=$${params.length}`); }
  const rows = await all(
    `SELECT t.id,t.letter_in_id,t.judul,t.deadline,t.prioritas,t.status,t.progress,t.pic_user_id,
            p.nama AS pic_nama, a.nama AS assigner_nama, li.no_agenda, li.perihal
       FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id JOIN users p ON p.id=t.pic_user_id JOIN users a ON a.id=t.assigner_id
      WHERE ${where.join(' AND ')}
      ORDER BY (t.status IN ('SELESAI','DIBATALKAN')), t.deadline NULLS LAST, t.id DESC LIMIT 300`,
    params,
  );
  res.json(rows.map(decorate));
}));

async function loadTask(db, user, id) {
  const t = await db.one(
    `SELECT t.*, p.nama AS pic_nama, a.nama AS assigner_nama, li.no_agenda, li.perihal
       FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id JOIN users p ON p.id=t.pic_user_id JOIN users a ON a.id=t.assigner_id WHERE t.id=$1`, [id],
  );
  if (!t) throw notFound('Tugas tidak ditemukan');
  await loadLetterIn(db, user, t.letter_in_id);
  return t;
}

r.get('/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const t = await loadTask({ one, all }, req.user, id);
  const updates = await all(`SELECT tu.*, u.nama AS user_nama FROM task_updates tu JOIN users u ON u.id=tu.user_id WHERE tu.task_id=$1 ORDER BY tu.id DESC`, [id]);
  const attachments = await all(`${ATT_SELECT} WHERE a.task_id=$1 ORDER BY a.created_at`, [id]);
  const isPic = t.pic_user_id === req.user.id;
  const isAssigner = t.assigner_id === req.user.id || is(req.user, 'superadmin', 'pimpinan');
  const closed = ['SELESAI', 'DIBATALKAN'].includes(t.status);
  res.json({
    task: decorate(t), updates, attachments,
    can: { update: (isPic || isAssigner) && !closed, batal: isAssigner && !closed, edit: isAssigner && !closed, buka: isAssigner && closed },
  });
}));

/** Ubah isi tugas oleh pemberi tugas. */
r.put('/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  await tx(async (db) => {
    const t = await loadTask(db, req.user, id);
    if (!(t.assigner_id === req.user.id || is(req.user, 'superadmin', 'pimpinan'))) throw forbidden();
    if (['SELESAI', 'DIBATALKAN'].includes(t.status)) throw conflict('Tugas sudah ditutup');
    const judul = str(b.judul, 'Judul tugas', { max: 200 });
    const deskripsi = str(b.deskripsi, 'Deskripsi', { max: 2000, required: false });
    const deadline = dateStr(b.deadline, 'Batas waktu');
    const prioritas = oneOf(b.prioritas, PRIORITAS, 'Prioritas');
    const pic = int(b.pic_user_id, 'Penanggung jawab');
    if (!(await db.one('SELECT 1 FROM users WHERE id=$1 AND aktif', [pic]))) throw bad('Penanggung jawab tidak valid');
    await db.q('UPDATE tasks SET judul=$1,deskripsi=$2,deadline=$3,prioritas=$4,pic_user_id=$5,updated_at=now() WHERE id=$6', [judul, deskripsi, deadline, prioritas, pic, id]);
    if (pic !== t.pic_user_id) await notify(db, [pic], { tipe: 'tugas', judul: 'Anda menerima tugas baru', isi: `${judul} (${t.no_agenda})`, link: `/tugas/${id}` }, req.user.id);
    await event(db, { letterInId: t.letter_in_id, userId: req.user.id, tipe: 'tugas', teks: `Tugas "${judul}" diperbarui`, meta: { task_id: id } });
    await audit(db, req, 'TUGAS_DIUBAH', 'task', id, { judul, deadline, pic });
  });
  res.json({ ok: true });
}));

/**
 * Pembaruan progres oleh PIC atau pemberi tugas.
 * Menunggu data memerlukan catatan dan memberi tahu pemberi tugas. Selesai menetapkan progres 100.
 */
r.post('/:id/update', upload.array('files', 10), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  const status = oneOf(b.status, Object.keys(TASK_STATUS), 'Status', { required: false });
  const catatan = str(b.catatan, 'Catatan', { max: 2000, required: false });
  let progress = int(b.progress, 'Progres', { required: false, min: 0, max: 100 });
  let checklist = null;
  if (b.checklist) {
    try { checklist = JSON.parse(b.checklist); } catch { throw bad('Format checklist tidak valid'); }
    if (!Array.isArray(checklist)) throw bad('Format checklist tidak valid');
    checklist = checklist.slice(0, 30).map((c) => ({ teks: String(c.teks || '').slice(0, 200), selesai: Boolean(c.selesai) }));
  }
  await tx(async (db) => {
    const t = await loadTask(db, req.user, id);
    const isPic = t.pic_user_id === req.user.id;
    const isAssigner = t.assigner_id === req.user.id || is(req.user, 'superadmin', 'pimpinan');
    if (!isPic && !isAssigner) throw forbidden('Hanya penanggung jawab atau pemberi tugas yang dapat memperbarui tugas');
    if (['SELESAI', 'DIBATALKAN'].includes(t.status)) throw conflict('Tugas sudah ditutup');
    if (status === 'DIBATALKAN' && !isAssigner) throw forbidden('Hanya pemberi tugas yang dapat membatalkan tugas');
    if (status === 'MENUNGGU_DATA' && !catatan) throw bad('Jelaskan data yang diminta pada catatan');
    if (status === 'DIBATALKAN' && !catatan) throw bad('Berikan alasan pembatalan pada catatan');
    let next = status || t.status;
    if (checklist && progress == null && checklist.length) progress = Math.round((checklist.filter((c) => c.selesai).length / checklist.length) * 100);
    if (next === 'SELESAI') progress = 100;
    if (progress != null && progress > 0 && ['BELUM_DIMULAI', 'DITERIMA'].includes(next) && !status) next = 'DIPROSES';
    if (progress === 100 && !status && next === 'DIPROSES') next = 'SELESAI';
    const newProgress = progress ?? t.progress;
    await db.q(
      `UPDATE tasks SET status=$1, progress=$2, checklist=COALESCE($3, checklist), updated_at=now(), selesai_at=CASE WHEN $1='SELESAI' THEN now() ELSE selesai_at END WHERE id=$4`,
      [next, newProgress, checklist ? JSON.stringify(checklist) : null, id],
    );
    await db.q('INSERT INTO task_updates(task_id,user_id,progress,status,catatan) VALUES($1,$2,$3,$4,$5)', [id, req.user.id, newProgress, next, catatan]);
    for (const f of req.files || []) {
      const a = await saveAttachment(db, { file: f, kategori: 'HASIL', letterInId: t.letter_in_id, taskId: id, userId: req.user.id });
      await event(db, { letterInId: t.letter_in_id, userId: req.user.id, tipe: 'dokumen', teks: `Dokumen hasil diunggah: ${a.nama} (v${a.versi})`, meta: { attachment_id: a.id, task_id: id } });
    }
    const label = TASK_STATUS[next];
    let teks = `Tugas "${t.judul}": ${label}, progres ${newProgress}%`;
    if (catatan) teks += `. ${catatan}`;
    await event(db, { letterInId: t.letter_in_id, userId: req.user.id, tipe: next === 'MENUNGGU_DATA' ? 'minta_info' : 'progres', teks, meta: { task_id: id } });
    if (next !== t.status && next !== 'DIPROSES') {
      const who = isPic ? [t.assigner_id] : [t.pic_user_id];
      await notify(db, who, { tipe: 'tugas', judul: `Tugas ${label.toLowerCase()}`, isi: `${t.judul} (${t.no_agenda})${catatan ? `: ${catatan}` : ''}`, link: `/tugas/${id}` }, req.user.id);
    }
    await recomputeStatus(db, t.letter_in_id);
    await audit(db, req, 'TUGAS_DIPERBARUI', 'task', id, { status: next, progress: newProgress });
  });
  res.json({ ok: true });
}));

export default r;
