import type { Disposition, LetterIn, StatusIn } from '@/domain/letter-in';
import type { AttachmentsRepo, ConfirmationsRepo, DispositionRow, DispositionsRepo, LettersInRepo, TaskRow, TasksRepo } from '@/server/application/ports';
import type { Db } from '../db/client';
import { visibleLettersIn } from '../db/visibility';

export const lettersInRepo = (db: Db): LettersInRepo => ({
  findVisible(actor, id) {
    const vis = visibleLettersIn(actor, 'li', 1);
    return db.one<LetterIn>(`SELECT li.* FROM letters_in li WHERE li.id=$1 AND ${vis.sql}`, [id, ...vis.params]);
  },
  exists: async (id) => Boolean(await db.one('SELECT 1 FROM letters_in WHERE id=$1', [id])),
  async isVisibleTo(user, id) {
    const vis = visibleLettersIn(user, 'li', 1);
    return Boolean(await db.one(`SELECT 1 FROM letters_in li WHERE li.id=$1 AND ${vis.sql}`, [id, ...vis.params]));
  },
  insert: async (l) => (await db.one(
    `INSERT INTO letters_in(no_agenda,case_no,no_surat,tgl_surat,tgl_diterima,asal,instansi,alamat,perihal,jenis,sifat,prioritas,lampiran,catatan,sla_due,qr_token,created_by,track_code,track_enabled)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,no_agenda,case_no`,
    [l.no_agenda, l.case_no, l.no_surat, l.tgl_surat, l.tgl_diterima, l.asal, l.instansi, l.alamat, l.perihal, l.jenis, l.sifat, l.prioritas, l.lampiran, l.catatan, l.sla_due, l.qr_token, l.created_by, l.track_code, l.track_enabled],
  ))!,
  async updateMeta(id, m) {
    await db.q(
      `UPDATE letters_in SET no_surat=$1,tgl_surat=$2,asal=$3,instansi=$4,alamat=$5,perihal=$6,sifat=$7,prioritas=$8,lampiran=$9,catatan=$10,sla_due=$11,updated_at=now() WHERE id=$12`,
      [m.no_surat, m.tgl_surat, m.asal, m.instansi, m.alamat, m.perihal, m.sifat, m.prioritas, m.lampiran, m.catatan, m.sla_due, id],
    );
  },
  lockStatus: async (id) => (await db.one<{ status: StatusIn }>('SELECT status FROM letters_in WHERE id=$1 FOR UPDATE', [id]))?.status ?? null,
  setStatus: async (id, status) => { await db.q('UPDATE letters_in SET status=$1, updated_at=now() WHERE id=$2', [status, id]); },
  statusFacts: async (id) => ({
    dispositions: await db.all('SELECT status, accepted_at FROM dispositions WHERE letter_in_id=$1', [id]),
    tasks: await db.all(`SELECT status FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN'`, [id]),
    outs: await db.all('SELECT status FROM letters_out WHERE letter_in_id=$1', [id]),
  }) as never,
  stageCounts: async (id) => (await db.one(
    `SELECT
       (SELECT count(*) FROM dispositions WHERE letter_in_id=$1 AND status <> 'DIKEMBALIKAN') AS disp,
       (SELECT count(*) FROM dispositions WHERE letter_in_id=$1 AND accepted_at IS NOT NULL) AS accepted,
       (SELECT count(*) FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN') AS tasks,
       (SELECT count(*) FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN' AND status <> 'SELESAI') AS tasks_open,
       (SELECT count(*) FROM tasks WHERE letter_in_id=$1 AND (progress > 0 OR status IN ('DIPROSES','MENUNGGU_DATA','MENUNGGU_KONFIRMASI','MENUNGGU_PERSETUJUAN','SELESAI'))) AS tasks_started,
       (SELECT count(*) FROM confirmations WHERE letter_in_id=$1) AS conf`, [id],
  ))! as never,
  completionFacts: async (id) => ({
    tasks: await db.all(`SELECT status FROM tasks WHERE letter_in_id=$1 AND status <> 'DIBATALKAN'`, [id]),
    outs: await db.all('SELECT no_agenda,status FROM letters_out WHERE letter_in_id=$1', [id]),
    confirmations: (await db.one<{ n: number }>('SELECT count(*) AS n FROM confirmations WHERE letter_in_id=$1', [id]))!.n,
  }) as never,
  markForwarded: async (id) => { await db.q(`UPDATE letters_in SET status='MENUNGGU_DISPOSISI', diteruskan_at=now(), updated_at=now() WHERE id=$1`, [id]); },
  async markDisposed(id, current) {
    await db.q('UPDATE letters_in SET diteruskan_at=COALESCE(diteruskan_at, now()) WHERE id=$1', [id]);
    if (current === 'DITERIMA' || current === 'MENUNGGU_DISPOSISI') await db.q(`UPDATE letters_in SET status='DIDISPOSISIKAN' WHERE id=$1`, [id]);
  },
  finish: async (id) => { await db.q(`UPDATE letters_in SET status='SELESAI', selesai_at=now(), updated_at=now() WHERE id=$1`, [id]); },
  archive: async (id) => { await db.q(`UPDATE letters_in SET status='DIARSIPKAN', arsip_at=now(), updated_at=now() WHERE id=$1`, [id]); },
  setTracking: async (id, code, enabled) => { await db.q('UPDATE letters_in SET track_code=$1, track_enabled=$2 WHERE id=$3', [code, enabled, id]); },
  participants: async (id) => (await db.all<{ x: number }>(`SELECT DISTINCT x FROM (
      SELECT created_by AS x FROM letters_in WHERE id=$1 UNION SELECT from_user_id FROM dispositions WHERE letter_in_id=$1
      UNION SELECT to_user_id FROM dispositions WHERE letter_in_id=$1 UNION SELECT pic_user_id FROM tasks WHERE letter_in_id=$1) s WHERE x IS NOT NULL`, [id])).map((p) => p.x),
  timeline: (id) => db.all(
    `SELECT e.id,e.tipe,e.teks,e.meta,e.created_at,e.letter_out_id,u.nama AS user_nama FROM events e LEFT JOIN users u ON u.id=e.user_id
      WHERE e.letter_in_id=$1 OR e.letter_out_id IN (SELECT id FROM letters_out WHERE letter_in_id=$1) ORDER BY e.created_at, e.id`, [id],
  ) as never,
  summary: (id) => db.one('SELECT id,no_agenda,perihal,asal FROM letters_in WHERE id=$1', [id]),
  idByQrToken: async (token) => (await db.one<{ id: number }>('SELECT id FROM letters_in WHERE qr_token=$1', [token]))?.id ?? null,
  trackingFacts: (code) => db.one(
    `SELECT li.no_surat, li.tgl_diterima, li.created_at, li.diteruskan_at, li.selesai_at, li.track_enabled,
            (SELECT min(created_at) FROM dispositions WHERE letter_in_id=li.id AND status<>'DIKEMBALIKAN') AS disp_at,
            (SELECT min(accepted_at) FROM dispositions WHERE letter_in_id=li.id) AS proc_at,
            (SELECT min(created_at) FROM confirmations WHERE letter_in_id=li.id) AS conf_at,
            (SELECT min(sent_at) FROM letters_out WHERE letter_in_id=li.id AND sent_at IS NOT NULL) AS sent_at
       FROM letters_in li WHERE li.track_code=$1`, [code],
  ),
});

export const dispositionsRepo = (db: Db): DispositionsRepo => ({
  forLetter: (letterId) => db.all<DispositionRow>(
    `SELECT d.*, fu.nama AS dari_nama, fu.jabatan AS dari_jabatan, tu.nama AS ke_nama, tu.jabatan AS ke_jabatan, un.nama AS ke_unit
       FROM dispositions d JOIN users fu ON fu.id=d.from_user_id LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id
      WHERE d.letter_in_id=$1 ORDER BY d.id`, [letterId],
  ),
  rawForLetter: (letterId) => db.all<Disposition>('SELECT * FROM dispositions WHERE letter_in_id=$1', [letterId]),
  lock: (id) => db.one<Disposition>('SELECT * FROM dispositions WHERE id=$1 FOR UPDATE', [id]),
  lockInLetter: (id, letterId) => db.one<Disposition>('SELECT * FROM dispositions WHERE id=$1 AND letter_in_id=$2 FOR UPDATE', [id, letterId]),
  insert: async (d) => (await db.one<{ id: number }>(
    `INSERT INTO dispositions(letter_in_id,parent_id,from_user_id,to_user_id,to_unit_id,tindakan,instruksi,deadline,prioritas)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [d.letterInId, d.parentId, d.fromUserId, d.toUserId, d.toUnitId, d.tindakan, d.instruksi, d.deadline, d.prioritas],
  ))!.id,
  accept: async (id, userId) => { await db.q(`UPDATE dispositions SET status='DITERIMA', accepted_at=now(), to_user_id=COALESCE(to_user_id,$2) WHERE id=$1`, [id, userId]); },
  acceptHeldBy: async (letterId, userId) => {
    await db.q(`UPDATE dispositions SET accepted_at=COALESCE(accepted_at, now()), status=CASE WHEN status='BARU' THEN 'DITERIMA' ELSE status END
                 WHERE letter_in_id=$1 AND to_user_id=$2`, [letterId, userId]);
  },
  giveBack: async (id, alasan) => { await db.q(`UPDATE dispositions SET status='DIKEMBALIKAN', return_reason=$2 WHERE id=$1`, [id, alasan]); },
  revive: async (id) => { await db.q(`UPDATE dispositions SET status = CASE WHEN accepted_at IS NULL THEN 'BARU' ELSE 'DITERIMA' END WHERE id=$1 AND status='DITERUSKAN'`, [id]); },
  markForwarded: async (id) => { await db.q(`UPDATE dispositions SET status='DITERUSKAN' WHERE id=$1 AND status IN ('BARU','DITERIMA')`, [id]); },
  finishForLetter: async (letterId) => { await db.q(`UPDATE dispositions SET status='SELESAI' WHERE letter_in_id=$1 AND status IN ('BARU','DITERIMA','DITERUSKAN')`, [letterId]); },
  openTaskCount: async (id) => (await db.one<{ n: number }>(`SELECT count(*) AS n FROM tasks WHERE disposition_id=$1 AND status NOT IN ('SELESAI','DIBATALKAN')`, [id]))!.n,
  sheetRows: (letterId) => db.all(
    `SELECT d.id,d.parent_id,d.tindakan,d.instruksi,d.deadline,d.prioritas,d.status,d.created_at,fu.nama AS dari,fu.jabatan AS dari_jabatan,
            COALESCE(tu.nama, un.nama) AS kepada, tu.jabatan AS kepada_jabatan
       FROM dispositions d JOIN users fu ON fu.id=d.from_user_id LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id
      WHERE d.letter_in_id=$1 ORDER BY d.id`, [letterId],
  ) as never,
});

const TASK_SELECT = `SELECT t.*, p.nama AS pic_nama, a.nama AS assigner_nama, li.no_agenda, li.perihal
  FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id JOIN users p ON p.id=t.pic_user_id JOIN users a ON a.id=t.assigner_id`;

export const tasksRepo = (db: Db): TasksRepo => ({
  find: (id) => db.one<TaskRow>(`${TASK_SELECT} WHERE t.id=$1`, [id]),
  forLetter: (letterId) => db.all<TaskRow>(`${TASK_SELECT} WHERE t.letter_in_id=$1 ORDER BY t.id`, [letterId]),
  updates: (id) => db.all('SELECT tu.*, u.nama AS user_nama FROM task_updates tu JOIN users u ON u.id=tu.user_id WHERE tu.task_id=$1 ORDER BY tu.id DESC', [id]) as never,
  insert: async (t) => (await db.one<{ id: number }>(
    `INSERT INTO tasks(letter_in_id,disposition_id,judul,deskripsi,pic_user_id,assigner_id,start_date,deadline,prioritas,checklist)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [t.letterInId, t.dispositionId, t.judul, t.deskripsi, t.picUserId, t.assignerId, t.startDate, t.deadline, t.prioritas, JSON.stringify(t.checklist)],
  ))!.id,
  update: async (id, t) => {
    await db.q('UPDATE tasks SET judul=$1,deskripsi=$2,deadline=$3,prioritas=$4,pic_user_id=$5,updated_at=now() WHERE id=$6', [t.judul, t.deskripsi, t.deadline, t.prioritas, t.picUserId, id]);
  },
  setProgress: async (id, status, progress, checklist) => {
    await db.q(
      `UPDATE tasks SET status=$1, progress=$2, checklist=COALESCE($3, checklist), updated_at=now(),
              selesai_at=CASE WHEN $1='SELESAI' THEN now() ELSE selesai_at END WHERE id=$4`,
      [status, progress, checklist ? JSON.stringify(checklist) : null, id],
    );
  },
  addUpdate: async (u) => { await db.q('INSERT INTO task_updates(task_id,user_id,progress,status,catatan) VALUES($1,$2,$3,$4,$5)', [u.taskId, u.userId, u.progress, u.status, u.catatan]); },
  setDeadline: async (id, deadline) => { await db.q('UPDATE tasks SET deadline=$1, updated_at=now() WHERE id=$2', [deadline, id]); },
  hasPic: async (letterId, userId) => Boolean(await db.one('SELECT 1 FROM tasks WHERE letter_in_id=$1 AND pic_user_id=$2', [letterId, userId])),
  dueSoon: () => db.all(
    `SELECT t.id,t.judul,t.deadline,t.pic_user_id,t.assigner_id,li.no_agenda FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id
      WHERE t.status NOT IN ('SELESAI','DIBATALKAN') AND t.deadline IS NOT NULL AND t.deadline <= (current_date + 3)`,
  ),
});

export const confirmationsRepo = (db: Db): ConfirmationsRepo => ({
  forLetter: (letterId) => db.all('SELECT c.*, u.nama AS user_nama FROM confirmations c JOIN users u ON u.id=c.user_id WHERE c.letter_in_id=$1 ORDER BY c.id', [letterId]) as never,
  insert: async (c) => (await db.one<{ id: number }>(
    'INSERT INTO confirmations(letter_in_id,tanggal,metode,pihak,hasil,catatan,bukti_attachment_id,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
    [c.letterInId, c.tanggal, c.metode, c.pihak, c.hasil, c.catatan, c.buktiAttachmentId, c.userId],
  ))!.id,
});

const ATT_SELECT = `SELECT a.id,a.nama,a.kategori,a.mime,a.ukuran,a.versi,a.task_id,a.created_at,a.letter_in_id,a.letter_out_id,u.nama AS uploader
  FROM attachments a LEFT JOIN users u ON u.id=a.uploader_id`;

export const attachmentsRepo = (db: Db): AttachmentsRepo => ({
  find: (id) => db.one('SELECT id,nama,mime,path,letter_in_id,letter_out_id FROM attachments WHERE id=$1', [id]),
  lastVersion: async (groupKey, letterInId, letterOutId) => (await db.one<{ v: number }>(
    `SELECT COALESCE(max(versi),0) AS v FROM attachments WHERE group_key=$1 AND letter_in_id IS NOT DISTINCT FROM $2 AND letter_out_id IS NOT DISTINCT FROM $3`,
    [groupKey, letterInId, letterOutId],
  ))!.v,
  insert: async (a) => (await db.one(
    `INSERT INTO attachments(letter_in_id,letter_out_id,task_id,kategori,nama,mime,ukuran,path,versi,group_key,uploader_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,nama,kategori,versi,ukuran,mime,created_at`,
    [a.letterInId, a.letterOutId, a.taskId, a.kategori, a.nama, a.mime, a.ukuran, a.path, a.versi, a.groupKey, a.uploaderId],
  ))! as never,
  forLetterIn: (id) => db.all(`${ATT_SELECT} WHERE a.letter_in_id=$1 ORDER BY a.created_at`, [id]) as never,
  forLetterOut: (id) => db.all(`${ATT_SELECT} WHERE a.letter_out_id=$1 ORDER BY a.created_at`, [id]) as never,
  forTask: (id) => db.all(`${ATT_SELECT} WHERE a.task_id=$1 ORDER BY a.created_at`, [id]) as never,
});
