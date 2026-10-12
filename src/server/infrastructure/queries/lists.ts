import type { Actor } from '@/domain/roles';
import { csvList } from '@/domain/validation';
import type {
  DispositionFilter, LetterInFilter, LetterInListRow, LetterOutFilter, LetterOutListRow, ListQueries, Repos, TaskFilter, TaskListRow,
} from '@/server/application/ports';
import { can } from '@/domain/roles';
import type { Db } from '../db/client';
import { like, pageParams, visibleLettersIn, visibleLettersOut, Where } from '../db/visibility';

/* Tenggat efektif surat (SQL): disposisi aktif terdekat, atau SLA. */
const DL = `COALESCE((SELECT min(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')), li.sla_due)`;
const OPEN_IN = `li.status NOT IN ('SELESAI','DIARSIPKAN')`;

async function idsOf(db: Db, from: string, where: Where, order = 'id') {
  const total = (await db.one<{ n: number }>(`SELECT count(*) AS n ${from} WHERE ${where.sql}`, where.params))!.n;
  const ids = (await db.all<{ id: number }>(`SELECT ${order} AS id ${from} WHERE ${where.sql} ORDER BY ${order} DESC LIMIT 500`, where.params)).map((x) => x.id);
  return { ids, total, terpotong: total > ids.length };
}

/* ---------- Surat masuk ---------- */

function inWhere(actor: Actor, f: LetterInFilter) {
  const w = new Where(visibleLettersIn(actor, 'li'));
  const status = csvList(f.status);
  if (status.length) w.add('li.status = ANY(?)', status);
  const sifat = csvList(f.sifat);
  if (sifat.length) w.add('li.sifat = ANY(?)', sifat);
  const prio = csvList(f.prioritas);
  if (prio.length) w.add('li.prioritas = ANY(?)', prio);
  if (f.from) w.add('li.tgl_diterima >= ?', f.from);
  if (f.to) w.add('li.tgl_diterima <= ?', f.to);
  if (f.unit) w.add(`EXISTS (SELECT 1 FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id WHERE d.letter_in_id=li.id AND d.status<>'DIKEMBALIKAN' AND COALESCE(du.unit_id,d.to_unit_id)=?)`, f.unit);
  if (f.pic) w.add(`(EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=li.id AND t.pic_user_id=?) OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=li.id AND d.to_user_id=? AND d.status<>'DIKEMBALIKAN'))`, f.pic);
  if (f.q) w.add('(li.no_agenda ILIKE ? OR li.no_surat ILIKE ? OR li.perihal ILIKE ? OR li.asal ILIKE ? OR li.instansi ILIKE ?)', like(f.q));
  if (f.antrian === 'belum_diteruskan') w.raw(`li.status = 'DITERIMA'`);
  if (f.antrian === 'terlambat') w.raw(`${OPEN_IN} AND ${DL} < current_date`);
  if (f.antrian === 'mendekati') w.raw(`${OPEN_IN} AND ${DL} BETWEEN current_date AND current_date + 2`);
  return w;
}
const IN_SORTS = { tgl: 'li.tgl_diterima', agenda: 'li.id', perihal: 'li.perihal', asal: 'li.asal', status: 'li.status', tenggat: DL, sifat: 'li.sifat' };
const IN_COLS = `li.id,li.no_agenda,li.no_surat,li.tgl_surat,li.tgl_diterima,li.asal,li.instansi,li.perihal,li.sifat,li.prioritas,li.status,li.sla_due,
  (SELECT array_agg(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')) AS deadlines,
  (SELECT string_agg(DISTINCT COALESCE(u.nama, un.nama), ', ') FROM dispositions d
     LEFT JOIN users u ON u.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id
    WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')) AS pic`;

export const lettersInQueries = (db: Db): ListQueries<LetterInFilter, LetterInListRow> => ({
  async list(actor, f, q) {
    const w = inWhere(actor, f);
    const pg = pageParams(q, { sorts: IN_SORTS, defaultSort: 'agenda' });
    const items = await db.all<LetterInListRow>(`SELECT ${IN_COLS} FROM letters_in li WHERE ${w.sql} ORDER BY ${pg.orderBy}, li.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n FROM letters_in li WHERE ${w.sql}`, w.params))!.n;
    return { items, total, page: pg.page, pageSize: pg.pageSize };
  },
  ids: (actor, f) => idsOf(db, 'FROM letters_in li', inWhere(actor, f), 'li.id'),
  exportRows(actor, f, q) {
    const w = inWhere(actor, f);
    const pg = pageParams(q, { sorts: IN_SORTS, defaultSort: 'agenda' });
    return db.all<LetterInListRow>(`SELECT ${IN_COLS} FROM letters_in li WHERE ${w.sql} ORDER BY ${pg.orderBy} LIMIT 5000`, w.params);
  },
});

/* ---------- Disposisi ---------- */

function dispWhere(actor: Actor, f: DispositionFilter) {
  const w = new Where(visibleLettersIn(actor, 'li'));
  if (f.scope === 'saya') {
    w.addEach('(d.to_user_id=? OR (d.to_unit_id=? AND ?::boolean))', actor.id, actor.unit_id ?? 0, actor.role === 'pejabat');
  }
  const st = csvList(f.status);
  if (st.length) w.add('d.status = ANY(?)', st);
  const pr = csvList(f.prioritas);
  if (pr.length) w.add('d.prioritas = ANY(?)', pr);
  if (f.q) w.add('(li.no_agenda ILIKE ? OR li.perihal ILIKE ? OR d.instruksi ILIKE ?)', like(f.q));
  if (f.antrian === 'terlambat') w.raw(`d.status IN ('BARU','DITERIMA') AND d.deadline < current_date`);
  return w;
}
const DFROM = `FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id JOIN users fu ON fu.id=d.from_user_id
  LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id`;

export const dispositionQueries = (db: Db): Repos['dispositionQueries'] => ({
  async list(actor, f, q) {
    const w = dispWhere(actor, f);
    const pg = pageParams(q, { sorts: { dibuat: 'd.id', tenggat: 'd.deadline', agenda: 'li.id', status: 'd.status', prioritas: 'd.prioritas' }, defaultSort: 'dibuat' });
    const items = await db.all(
      `SELECT d.id,d.letter_in_id,d.tindakan,d.instruksi,d.deadline,d.prioritas,d.status,d.accepted_at,d.created_at,d.return_reason,
              li.no_agenda,li.perihal,li.asal,li.status AS letter_status, fu.nama AS dari, COALESCE(tu.nama, un.nama) AS kepada
         ${DFROM} WHERE ${w.sql} ORDER BY ${pg.orderBy}, d.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params,
    );
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n ${DFROM} WHERE ${w.sql}`, w.params))!.n;
    return { items: items as never, total, page: pg.page, pageSize: pg.pageSize };
  },
  ids: (actor, f) => idsOf(db, 'FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id', dispWhere(actor, f), 'd.id'),
});

/* ---------- Tugas ---------- */

function taskWhere(actor: Actor, f: TaskFilter) {
  const w = new Where(visibleLettersIn(actor, 'li'));
  if (f.scope === 'saya') w.add('t.pic_user_id=?', actor.id);
  if (f.scope === 'diberikan') w.add('t.assigner_id=?', actor.id);
  const st = csvList(f.status);
  if (st.length) w.add('t.status = ANY(?)', st);
  const pr = csvList(f.prioritas);
  if (pr.length) w.add('t.prioritas = ANY(?)', pr);
  if (f.pic) w.add('t.pic_user_id=?', f.pic);
  if (f.q) w.add('(t.judul ILIKE ? OR li.no_agenda ILIKE ? OR li.perihal ILIKE ?)', like(f.q));
  if (f.from) w.add('t.deadline >= ?', f.from);
  if (f.to) w.add('t.deadline <= ?', f.to);
  const open = `t.status NOT IN ('SELESAI','DIBATALKAN')`;
  if (f.antrian === 'terlambat') w.raw(`${open} AND t.deadline < current_date`);
  if (f.antrian === 'mendekati') w.raw(`${open} AND t.deadline BETWEEN current_date AND current_date + 2`);
  if (f.antrian === 'hari_ini') w.raw(`${open} AND t.deadline = current_date`);
  if (f.antrian === 'terbuka') w.raw(open);
  return w;
}
const TFROM = 'FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id JOIN users p ON p.id=t.pic_user_id JOIN users a ON a.id=t.assigner_id';
const TCOLS = 't.id,t.letter_in_id,t.judul,t.deadline,t.prioritas,t.status,t.progress,t.pic_user_id,p.nama AS pic_nama,a.nama AS assigner_nama,li.no_agenda,li.perihal';
const T_SORTS = { tenggat: 't.deadline', judul: 't.judul', status: 't.status', progres: 't.progress', prioritas: 't.prioritas', agenda: 'li.id', dibuat: 't.id' };

export const taskQueries = (db: Db): ListQueries<TaskFilter, TaskListRow> => ({
  async list(actor, f, q) {
    const w = taskWhere(actor, f);
    const pg = pageParams(q, { sorts: T_SORTS, defaultSort: 'tenggat', defaultDir: 'asc' });
    const items = await db.all<TaskListRow>(`SELECT ${TCOLS} ${TFROM} WHERE ${w.sql} ORDER BY (t.status IN ('SELESAI','DIBATALKAN')), ${pg.orderBy}, t.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n ${TFROM} WHERE ${w.sql}`, w.params))!.n;
    return { items, total, page: pg.page, pageSize: pg.pageSize };
  },
  ids: (actor, f) => idsOf(db, TFROM, taskWhere(actor, f), 't.id'),
  exportRows(actor, f, q) {
    const w = taskWhere(actor, f);
    const pg = pageParams(q, { sorts: T_SORTS, defaultSort: 'tenggat', defaultDir: 'asc' });
    return db.all<TaskListRow>(`SELECT ${TCOLS} ${TFROM} WHERE ${w.sql} ORDER BY (t.status IN ('SELESAI','DIBATALKAN')), ${pg.orderBy} LIMIT 5000`, w.params);
  },
});

/* ---------- Surat keluar ---------- */

function outWhere(actor: Actor, f: LetterOutFilter) {
  const w = new Where(visibleLettersOut(actor, 'lo'));
  const st = csvList(f.status);
  if (st.length) w.add('lo.status = ANY(?)', st);
  if (f.mine) w.add('lo.created_by=?', actor.id);
  if (f.jenis) w.add('lo.jenis = ?', f.jenis);
  if (f.from) w.add('lo.tgl_surat >= ?', f.from);
  if (f.to) w.add('lo.tgl_surat <= ?', f.to);
  if (f.antrian === 'menunggu_saya') {
    if (can.approve(actor)) w.raw(`lo.status='MENUNGGU_PERSETUJUAN'`);
    else if (can.review(actor)) w.raw(`lo.status='REVIEW'`);
    else w.raw('FALSE');
  }
  if (f.q) w.add('(lo.no_agenda ILIKE ? OR lo.nomor_surat ILIKE ? OR lo.perihal ILIKE ? OR lo.tujuan ILIKE ?)', like(f.q));
  return w;
}
const OFROM = 'FROM letters_out lo JOIN users u ON u.id=lo.created_by LEFT JOIN letters_in li ON li.id=lo.letter_in_id';
const OCOLS = 'lo.id,lo.no_agenda,lo.nomor_surat,lo.jenis,lo.perihal,lo.tujuan,lo.status,lo.tgl_surat,lo.created_at,lo.letter_in_id,u.nama AS pembuat,li.no_agenda AS asal_agenda';
const O_SORTS = { dibuat: 'lo.id', tgl: 'lo.tgl_surat', perihal: 'lo.perihal', tujuan: 'lo.tujuan', status: 'lo.status', nomor: 'lo.nomor_surat', agenda: 'lo.id' };

export const letterOutQueries = (db: Db): ListQueries<LetterOutFilter, LetterOutListRow> => ({
  async list(actor, f, q) {
    const w = outWhere(actor, f);
    const pg = pageParams(q, { sorts: O_SORTS, defaultSort: 'dibuat' });
    const items = await db.all<LetterOutListRow>(`SELECT ${OCOLS} ${OFROM} WHERE ${w.sql} ORDER BY ${pg.orderBy}, lo.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
    const total = (await db.one<{ n: number }>(`SELECT count(*) AS n ${OFROM} WHERE ${w.sql}`, w.params))!.n;
    return { items, total, page: pg.page, pageSize: pg.pageSize };
  },
  ids: (actor, f) => idsOf(db, OFROM, outWhere(actor, f), 'lo.id'),
  exportRows(actor, f, q) {
    const w = outWhere(actor, f);
    const pg = pageParams(q, { sorts: O_SORTS, defaultSort: 'dibuat' });
    return db.all<LetterOutListRow>(`SELECT ${OCOLS} ${OFROM} WHERE ${w.sql} ORDER BY ${pg.orderBy} LIMIT 5000`, w.params);
  },
});
