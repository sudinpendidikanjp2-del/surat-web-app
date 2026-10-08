import { one, all } from './db.js';
import { notFound, forbidden } from './util.js';
import { visibleLettersIn, is } from './perm.js';
import { slaIndicator } from './sla.js';

export const STATUS_IN = {
  DITERIMA: 'Diterima',
  MENUNGGU_DISPOSISI: 'Menunggu disposisi',
  DIDISPOSISIKAN: 'Didisposisikan',
  SEDANG_DIPROSES: 'Sedang diproses',
  MENUNGGU_KONFIRMASI: 'Menunggu konfirmasi',
  MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan',
  SELESAI: 'Selesai',
  DIARSIPKAN: 'Diarsipkan',
};

/** Muat surat masuk beserta pemeriksaan hak lihat. */
export async function loadLetterIn(db, user, id) {
  const vis = visibleLettersIn(user, 'li', 1);
  const row = await db.one(`SELECT li.* FROM letters_in li WHERE li.id=$1 AND ${vis.sql}`, [id, ...vis.params]);
  if (!row) {
    const exists = await db.one('SELECT 1 FROM letters_in WHERE id=$1', [id]);
    throw exists ? forbidden('Anda tidak memiliki akses ke surat ini') : notFound('Surat tidak ditemukan');
  }
  return row;
}

export async function canSeeLetterIn(user, id) {
  const vis = visibleLettersIn(user, 'li', 1);
  return Boolean(await one(`SELECT 1 FROM letters_in li WHERE li.id=$1 AND ${vis.sql}`, [id, ...vis.params]));
}

/** Penerima disposisi aktif: langsung, atau pejabat dari unit tujuan. */
export function holdsDisposition(user, d) {
  if (d.status === 'DIKEMBALIKAN') return false;
  if (d.to_user_id === user.id) return true;
  return Boolean(d.to_unit_id && d.to_unit_id === user.unit_id && is(user, 'pejabat'));
}

/**
 * Hitung ulang status surat dari keadaan nyata (disposisi, tugas, surat keluar).
 * Status akhir (SELESAI, DIARSIPKAN) dan fase awal sebelum ada disposisi tidak diubah.
 */
export async function recomputeStatus(db, letterId) {
  const li = await db.one('SELECT status FROM letters_in WHERE id=$1 FOR UPDATE', [letterId]);
  if (!li || ['SELESAI', 'DIARSIPKAN'].includes(li.status)) return li?.status;
  const disp = await db.all('SELECT status, accepted_at FROM dispositions WHERE letter_in_id=$1', [letterId]);
  let next = li.status;
  if (disp.length > 0) {
    const active = disp.filter((d) => d.status !== 'DIKEMBALIKAN');
    if (active.length === 0) next = 'MENUNGGU_DISPOSISI';
    else if (!active.some((d) => d.accepted_at)) next = 'DIDISPOSISIKAN';
    else {
      const tasks = await db.all(`SELECT status FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN'`, [letterId]);
      const outs = await db.all(`SELECT status FROM letters_out WHERE letter_in_id=$1`, [letterId]);
      const waitingApproval = outs.some((o) => ['REVIEW', 'MENUNGGU_PERSETUJUAN'].includes(o.status));
      const allDone = tasks.length > 0 && tasks.every((t) => t.status === 'SELESAI');
      if (waitingApproval) next = 'MENUNGGU_PERSETUJUAN';
      else if (allDone || tasks.some((t) => t.status === 'MENUNGGU_KONFIRMASI')) next = 'MENUNGGU_KONFIRMASI';
      else next = 'SEDANG_DIPROSES';
    }
  }
  if (next !== li.status) await db.q('UPDATE letters_in SET status=$1, updated_at=now() WHERE id=$2', [next, letterId]);
  else await db.q('UPDATE letters_in SET updated_at=now() WHERE id=$1', [letterId]);
  return next;
}

/** Tahapan progres (PRD bagian 15). Persen = tahap selesai / jumlah tahap. */
export async function stagesFor(letter) {
  const id = letter.id;
  const c = await one(
    `SELECT
       (SELECT count(*) FROM dispositions WHERE letter_in_id=$1 AND status <> 'DIKEMBALIKAN') AS disp,
       (SELECT count(*) FROM dispositions WHERE letter_in_id=$1 AND accepted_at IS NOT NULL) AS accepted,
       (SELECT count(*) FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN') AS tasks,
       (SELECT count(*) FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN' AND status <> 'SELESAI') AS tasks_open,
       (SELECT count(*) FROM tasks WHERE letter_in_id=$1 AND (progress > 0 OR status IN ('DIPROSES','MENUNGGU_DATA','MENUNGGU_KONFIRMASI','MENUNGGU_PERSETUJUAN','SELESAI'))) AS tasks_started,
       (SELECT count(*) FROM confirmations WHERE letter_in_id=$1) AS conf`,
    [id],
  );
  const done = ['SELESAI', 'DIARSIPKAN'].includes(letter.status);
  const stages = [
    { key: 'diterima', label: 'Diterima TU', done: true },
    { key: 'diteruskan', label: 'Diteruskan kepada pimpinan', done: Boolean(letter.diteruskan_at) || c.disp > 0 },
    { key: 'disposisi', label: 'Didisposisikan', done: c.disp > 0 },
    { key: 'diterima_pelaksana', label: 'Diterima pelaksana', done: c.accepted > 0 },
    { key: 'diproses', label: 'Diproses', done: c.tasks_started > 0 || done },
    { key: 'tindak_lanjut', label: 'Tindak lanjut selesai', done: (c.tasks > 0 && c.tasks_open === 0) || done },
    { key: 'konfirmasi', label: 'Konfirmasi dicatat', done: c.conf > 0 },
    { key: 'selesai', label: 'Selesai', done },
  ];
  const percent = Math.round((stages.filter((s) => s.done).length / stages.length) * 100);
  return { stages, percent };
}

/** Syarat penyelesaian (PRD bagian 19). */
export async function completionChecks(letterId) {
  const tasks = await all(`SELECT judul,status FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN'`, [letterId]);
  const outs = await all(`SELECT no_agenda,status FROM letters_out WHERE letter_in_id=$1`, [letterId]);
  const conf = await one('SELECT count(*) AS n FROM confirmations WHERE letter_in_id=$1', [letterId]);
  const checks = [
    { ok: tasks.every((t) => t.status === 'SELESAI'), label: tasks.length ? 'Semua tugas selesai' : 'Tidak ada tugas terbuka' },
    { ok: outs.every((o) => ['DIKIRIM', 'SELESAI'].includes(o.status)), label: outs.length ? 'Surat balasan sudah dikirim' : 'Tidak ada surat balasan yang tertunda' },
    { ok: conf.n > 0, label: 'Konfirmasi kepada pemberi surat dicatat' },
  ];
  const openTasks = tasks.filter((t) => t.status !== 'SELESAI').length;
  if (openTasks) checks[0].label = `Semua tugas selesai (${openTasks} tugas belum selesai)`;
  const openOuts = outs.filter((o) => !['DIKIRIM', 'SELESAI'].includes(o.status));
  if (openOuts.length) checks[1].label = `Surat balasan sudah dikirim (${openOuts.map((o) => o.no_agenda).join(', ')} belum)`;
  return { checks, ok: checks.every((c) => c.ok) };
}

/** Tenggat efektif surat: disposisi aktif terdekat, atau SLA bila belum ada. */
export function effectiveDeadline(letter, dispDeadlines = []) {
  const ds = dispDeadlines.filter(Boolean).sort();
  return ds[0] || letter.sla_due || null;
}

export const indicatorFor = (letter, deadline) =>
  slaIndicator(deadline, new Date(), ['SELESAI', 'DIARSIPKAN'].includes(letter.status));
