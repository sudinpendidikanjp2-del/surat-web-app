import { STATUS_IN, type StatusIn } from '@/domain/letter-in';
import { STATUS_OUT, type StatusOut } from '@/domain/letter-out';
import type { InsightQueries, ReportQueries, ReportTable } from '@/server/application/ports';
import type { Db } from '../db/client';
import { like, visibleLettersIn, visibleLettersOut, Where } from '../db/visibility';

const DL = `COALESCE((SELECT min(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')), li.sla_due)`;
const OPEN_IN = `li.status NOT IN ('SELESAI','DIARSIPKAN')`;
const OPEN_TASK = `status NOT IN ('SELESAI','DIBATALKAN')`;

export const insightQueries = (db: Db): InsightQueries => ({
  async countsIn(actor, year) {
    const vis = visibleLettersIn(actor, 'li', 1);
    return (await db.one(
      `SELECT
         count(*) FILTER (WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1) AS masuk_tahun_ini,
         count(*) FILTER (WHERE li.status='DITERIMA') AS belum_diteruskan,
         count(*) FILTER (WHERE li.status='MENUNGGU_DISPOSISI') AS menunggu_disposisi,
         count(*) FILTER (WHERE li.status IN ('DIDISPOSISIKAN','SEDANG_DIPROSES','MENUNGGU_PERSETUJUAN')) AS diproses,
         count(*) FILTER (WHERE li.status='MENUNGGU_KONFIRMASI') AS menunggu_konfirmasi,
         count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} < current_date) AS terlambat,
         count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} = current_date) AS jatuh_tempo_hari_ini,
         count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} BETWEEN current_date+1 AND current_date+2) AS mendekati,
         count(*) FILTER (WHERE li.status IN ('SELESAI','DIARSIPKAN') AND date_trunc('month', li.selesai_at)=date_trunc('month', now())) AS selesai_bulan_ini,
         count(*) FILTER (WHERE li.tgl_diterima=current_date) AS masuk_hari_ini
       FROM letters_in li WHERE ${vis.sql}`, [year, ...vis.params],
    ))!;
  },
  async countsOut(actor, year) {
    const vis = visibleLettersOut(actor, 'lo', 1);
    return (await db.one(
      `SELECT count(*) FILTER (WHERE lo.status='MENUNGGU_PERSETUJUAN') AS menunggu_persetujuan,
              count(*) FILTER (WHERE lo.status='REVIEW') AS menunggu_review,
              count(*) FILTER (WHERE lo.status IN ('DRAFT','REVISI')) AS draft,
              count(*) FILTER (WHERE lo.status='NOMOR_DIBERIKAN') AS menunggu_ttd,
              count(*) FILTER (WHERE lo.status='DITANDATANGANI') AS menunggu_kirim,
              count(*) FILTER (WHERE EXTRACT(YEAR FROM lo.created_at)=$1) AS keluar_tahun_ini
         FROM letters_out lo WHERE ${vis.sql}`, [year, ...vis.params],
    ))!;
  },
  awaitingDisposition: () => db.all(`SELECT li.id,li.no_agenda,li.perihal,li.asal,li.sifat,li.prioritas,li.tgl_diterima FROM letters_in li
                                      WHERE li.status='MENUNGGU_DISPOSISI' ORDER BY li.tgl_diterima, li.id LIMIT 12`) as never,
  tasksNeedingAttention: () => db.all(
    `SELECT t.id,t.judul,t.deadline,t.status,p.nama AS pic_nama,li.no_agenda,(t.deadline < current_date) AS terlambat
       FROM tasks t JOIN users p ON p.id=t.pic_user_id JOIN letters_in li ON li.id=t.letter_in_id
      WHERE t.${OPEN_TASK} AND t.deadline <= current_date + 2 ORDER BY t.deadline LIMIT 8`,
  ) as never,
  awaitingApproval: () => db.all(`SELECT lo.id,lo.no_agenda,lo.perihal,lo.jenis,u.nama AS pembuat FROM letters_out lo JOIN users u ON u.id=lo.created_by
                                   WHERE lo.status='MENUNGGU_PERSETUJUAN' ORDER BY lo.updated_at LIMIT 12`) as never,
  async monthly(year) {
    const toMap = (rows: { m: number; n: number }[]) => Object.fromEntries(rows.map((x) => [x.m, x.n]));
    return {
      masuk: toMap(await db.all(`SELECT EXTRACT(MONTH FROM tgl_diterima)::int AS m, count(*) AS n FROM letters_in WHERE EXTRACT(YEAR FROM tgl_diterima)=$1 GROUP BY 1`, [year])),
      selesai: toMap(await db.all(`SELECT EXTRACT(MONTH FROM selesai_at)::int AS m, count(*) AS n FROM letters_in WHERE selesai_at IS NOT NULL AND EXTRACT(YEAR FROM selesai_at)=$1 GROUP BY 1`, [year])),
    };
  },
  perUnit: () => db.all(
    `SELECT COALESCE(un.nama,'Tanpa unit') AS unit, count(DISTINCT d.letter_in_id) AS jumlah
       FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id LEFT JOIN units un ON un.id=COALESCE(du.unit_id, d.to_unit_id)
      WHERE d.status <> 'DIKEMBALIKAN' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
  ),
  averageDaysToFinish: async () => {
    const v = (await db.one<{ d: string | null }>(`SELECT round(avg(EXTRACT(EPOCH FROM (selesai_at - created_at))/86400)::numeric, 1) AS d FROM letters_in WHERE selesai_at IS NOT NULL`))!.d;
    return v == null ? null : Number(v);
  },
  notForwarded: () => db.all(`SELECT li.id,li.no_agenda,li.perihal,li.asal,li.tgl_diterima FROM letters_in li WHERE li.status='DITERIMA' ORDER BY li.id LIMIT 12`) as never,
  lastNumber: () => db.one('SELECT nomor_surat, no_agenda, id FROM letters_out WHERE nomor_surat IS NOT NULL ORDER BY id DESC LIMIT 1'),
  myTaskCounts: async (userId) => (await db.one(
    `SELECT
       count(*) FILTER (WHERE status IN ('BELUM_DIMULAI','DITERIMA')) AS belum,
       count(*) FILTER (WHERE status='DIPROSES') AS diproses,
       count(*) FILTER (WHERE status='MENUNGGU_DATA') AS menunggu_data,
       count(*) FILTER (WHERE status IN ('MENUNGGU_KONFIRMASI','MENUNGGU_PERSETUJUAN')) AS menunggu_lain,
       count(*) FILTER (WHERE ${OPEN_TASK} AND deadline BETWEEN current_date AND current_date+2) AS mendekati,
       count(*) FILTER (WHERE ${OPEN_TASK} AND deadline < current_date) AS terlambat,
       count(*) FILTER (WHERE status='SELESAI') AS selesai,
       count(*) FILTER (WHERE ${OPEN_TASK} AND (prioritas='Mendesak' OR deadline < current_date)) AS urgent,
       count(*) FILTER (WHERE ${OPEN_TASK} AND deadline = current_date) AS hari_ini,
       count(*) FILTER (WHERE ${OPEN_TASK}) AS terbuka
     FROM tasks WHERE pic_user_id=$1`, [userId],
  ))!,
  newDispositionsFor: (actor) => db.all(
    `SELECT d.id,d.letter_in_id,d.instruksi,d.deadline,d.prioritas,li.no_agenda,li.perihal,fu.nama AS dari
       FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id JOIN users fu ON fu.id=d.from_user_id
      WHERE d.status='BARU' AND (d.to_user_id=$1 OR (d.to_unit_id=$2 AND $3::boolean)) ORDER BY d.deadline NULLS LAST LIMIT 12`,
    [actor.id, actor.unit_id ?? 0, actor.role === 'pejabat'],
  ) as never,
  myNearestTasks: (userId) => db.all(
    `SELECT t.id,t.judul,t.deadline,t.status,t.progress,t.prioritas,li.no_agenda,li.perihal FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id
      WHERE t.pic_user_id=$1 AND t.${OPEN_TASK} ORDER BY t.deadline NULLS LAST LIMIT 12`, [userId],
  ) as never,
  searchIn(actor, f) {
    const w = new Where(visibleLettersIn(actor, 'li'));
    if (f.q) {
      w.add(`(li.no_agenda ILIKE ? OR li.no_surat ILIKE ? OR li.perihal ILIKE ? OR li.asal ILIKE ? OR li.instansi ILIKE ? OR li.catatan ILIKE ?
          OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=li.id AND d.instruksi ILIKE ?)
          OR EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=li.id AND (t.judul ILIKE ? OR t.deskripsi ILIKE ?))
          OR EXISTS (SELECT 1 FROM attachments a WHERE a.letter_in_id=li.id AND a.nama ILIKE ?))`, like(f.q));
    }
    if (f.from) w.add('li.tgl_diterima >= ?', f.from);
    if (f.to) w.add('li.tgl_diterima <= ?', f.to);
    if (f.status) w.add('li.status = ?', f.status);
    if (f.sifat) w.add('li.sifat = ?', f.sifat);
    if (f.prioritas) w.add('li.prioritas = ?', f.prioritas);
    if (f.tahun) w.add('EXTRACT(YEAR FROM li.tgl_diterima) = ?', f.tahun);
    if (f.unit) w.add(`EXISTS (SELECT 1 FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id WHERE d.letter_in_id=li.id AND COALESCE(du.unit_id,d.to_unit_id)=?)`, f.unit);
    if (f.pic) w.add(`(EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=li.id AND t.pic_user_id=?) OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=li.id AND d.to_user_id=?))`, f.pic);
    return db.all(
      `SELECT li.id,li.no_agenda,li.no_surat AS nomor,li.perihal,li.asal AS pihak,li.tgl_diterima AS tanggal,li.status,li.sifat,li.prioritas,li.sla_due,
              ${DL} AS deadline FROM letters_in li WHERE ${w.sql} ORDER BY li.id DESC LIMIT 100`, w.params,
    ) as never;
  },
  searchOut(actor, f) {
    const w = new Where(visibleLettersOut(actor, 'lo'));
    if (f.q) w.add('(lo.no_agenda ILIKE ? OR lo.nomor_surat ILIKE ? OR lo.perihal ILIKE ? OR lo.tujuan ILIKE ? OR lo.jenis ILIKE ? OR lo.fields::text ILIKE ?)', like(f.q));
    if (f.from) w.add('lo.tgl_surat >= ?', f.from);
    if (f.to) w.add('lo.tgl_surat <= ?', f.to);
    if (f.status) w.add('lo.status = ?', f.status);
    if (f.tahun) w.add('EXTRACT(YEAR FROM lo.tgl_surat) = ?', f.tahun);
    if (f.unit) w.add('EXISTS (SELECT 1 FROM users cu WHERE cu.id=lo.created_by AND cu.unit_id=?)', f.unit);
    if (f.pic) w.add('lo.created_by = ?', f.pic);
    return db.all(
      `SELECT lo.id,lo.no_agenda,lo.nomor_surat AS nomor,lo.perihal,lo.tujuan AS pihak,lo.tgl_surat AS tanggal,lo.status,lo.jenis
         FROM letters_out lo WHERE ${w.sql} ORDER BY lo.id DESC LIMIT 100`, w.params,
    ) as never;
  },
  async archiveCounts(actor) {
    const vi = visibleLettersIn(actor, 'li');
    const vo = visibleLettersOut(actor, 'lo');
    return {
      masuk: await db.all(`SELECT EXTRACT(YEAR FROM li.tgl_diterima)::int AS tahun, EXTRACT(MONTH FROM li.tgl_diterima)::int AS bulan, count(*) AS n FROM letters_in li WHERE ${vi.sql} GROUP BY 1,2`, vi.params),
      keluar: await db.all(`SELECT EXTRACT(YEAR FROM lo.tgl_surat)::int AS tahun, EXTRACT(MONTH FROM lo.tgl_surat)::int AS bulan, count(*) AS n FROM letters_out lo WHERE ${vo.sql} GROUP BY 1,2`, vo.params),
    } as never;
  },
  archiveList(actor, f) {
    if (f.jenis === 'masuk') {
      const v = visibleLettersIn(actor, 'li', 2);
      return db.all(
        `SELECT li.id,li.no_agenda,li.no_surat AS nomor,li.perihal,li.asal AS pihak,li.tgl_diterima AS tanggal,li.status,
                (SELECT count(*) FROM attachments a WHERE a.letter_in_id=li.id) AS dokumen
           FROM letters_in li WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1 AND EXTRACT(MONTH FROM li.tgl_diterima)=$2 AND ${v.sql} ORDER BY li.tgl_diterima, li.id`,
        [f.tahun, f.bulan, ...v.params],
      ) as never;
    }
    const v = visibleLettersOut(actor, 'lo', 2);
    return db.all(
      `SELECT lo.id,lo.no_agenda,lo.nomor_surat AS nomor,lo.perihal,lo.tujuan AS pihak,lo.tgl_surat AS tanggal,lo.status,
              (SELECT count(*) FROM attachments a WHERE a.letter_out_id=lo.id) AS dokumen
         FROM letters_out lo WHERE EXTRACT(YEAR FROM lo.tgl_surat)=$1 AND EXTRACT(MONTH FROM lo.tgl_surat)=$2 AND ${v.sql} ORDER BY lo.tgl_surat, lo.id`,
      [f.tahun, f.bulan, ...v.params],
    ) as never;
  },
  async yearStats(actor, tahun) {
    const vi = visibleLettersIn(actor, 'li', 1);
    const vo = visibleLettersOut(actor, 'lo', 1);
    const a = await db.one<{ masuk: number; selesai: number; terlambat: number }>(
      `SELECT count(*) AS masuk, count(*) FILTER (WHERE li.status IN ('SELESAI','DIARSIPKAN')) AS selesai,
              count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} < current_date) AS terlambat
         FROM letters_in li WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1 AND ${vi.sql}`, [tahun, ...vi.params],
    );
    const k = await db.one<{ keluar: number }>(`SELECT count(*) AS keluar FROM letters_out lo WHERE EXTRACT(YEAR FROM lo.tgl_surat)=$1 AND ${vo.sql}`, [tahun, ...vo.params]);
    const d = await db.one<{ n: number }>(`SELECT count(*) AS n FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1 AND ${vi.sql}`, [tahun, ...vi.params]);
    return { ...a!, ...k!, disposisi: d!.n };
  },
});

/* ---------- Laporan ---------- */

export const reportQueries = (db: Db): ReportQueries => ({
  async build(actor, jenis, from, to) {
    const vi = visibleLettersIn(actor, 'li', 2);
    const vo = visibleLettersOut(actor, 'lo', 2);
    const tables: ReportTable[] = [];
    const tbl = (judul: string, columns: string[], rows: unknown[][]) => tables.push({ judul, columns, rows });
    const P = [from, to];
    if (jenis === 'surat-masuk') {
      const base = `FROM letters_in li WHERE li.tgl_diterima BETWEEN $1 AND $2 AND ${vi.sql}`;
      const pp = [...P, ...vi.params];
      tbl('Per bulan', ['Bulan', 'Jumlah'], (await db.all(`SELECT to_char(li.tgl_diterima,'YYYY-MM') AS b, count(*) ${base} GROUP BY 1 ORDER BY 1`, pp)).map((x) => [x.b, x.count]));
      tbl('Per jenis', ['Jenis', 'Jumlah'], (await db.all(`SELECT li.jenis, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.jenis, x.count]));
      tbl('Per pengirim', ['Pengirim', 'Jumlah'], (await db.all(`SELECT li.asal, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT 25`, pp)).map((x) => [x.asal, x.count]));
      tbl('Per unit tujuan disposisi', ['Unit', 'Jumlah surat'], (await db.all(
        `SELECT COALESCE(un.nama,'Belum didisposisikan') AS unit, count(DISTINCT li.id) AS n FROM letters_in li
           LEFT JOIN dispositions d ON d.letter_in_id=li.id AND d.status<>'DIKEMBALIKAN' LEFT JOIN users du ON du.id=d.to_user_id LEFT JOIN units un ON un.id=COALESCE(du.unit_id,d.to_unit_id)
          WHERE li.tgl_diterima BETWEEN $1 AND $2 AND ${vi.sql} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.unit, x.n]));
      tbl('Daftar surat masuk', ['No. Agenda', 'No. Surat', 'Tanggal diterima', 'Asal', 'Perihal', 'Sifat', 'Prioritas', 'Status'],
        (await db.all(`SELECT li.no_agenda,li.no_surat,li.tgl_diterima,li.asal,li.perihal,li.sifat,li.prioritas,li.status ${base} ORDER BY li.id`, pp))
          .map((x) => [x.no_agenda, x.no_surat, x.tgl_diterima, x.asal, x.perihal, x.sifat, x.prioritas, STATUS_IN[x.status as StatusIn]]));
    } else if (jenis === 'surat-keluar') {
      const base = `FROM letters_out lo JOIN users cu ON cu.id=lo.created_by LEFT JOIN users sg ON sg.id=lo.penandatangan_id WHERE lo.tgl_surat BETWEEN $1 AND $2 AND ${vo.sql}`;
      const pp = [...P, ...vo.params];
      tbl('Per bulan', ['Bulan', 'Jumlah'], (await db.all(`SELECT to_char(lo.tgl_surat,'YYYY-MM') AS b, count(*) ${base} GROUP BY 1 ORDER BY 1`, pp)).map((x) => [x.b, x.count]));
      tbl('Per jenis', ['Jenis', 'Jumlah'], (await db.all(`SELECT lo.jenis, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.jenis, x.count]));
      tbl('Per penandatangan', ['Penandatangan', 'Jumlah'], (await db.all(`SELECT COALESCE(sg.nama,'Belum ditentukan') AS n, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.count]));
      tbl('Daftar surat keluar', ['No. Agenda', 'Nomor surat', 'Tanggal', 'Jenis', 'Tujuan', 'Perihal', 'Penandatangan', 'Status'],
        (await db.all(`SELECT lo.no_agenda,lo.nomor_surat,lo.tgl_surat,lo.jenis,lo.tujuan,lo.perihal,sg.nama AS ttd,lo.status ${base} ORDER BY lo.id`, pp))
          .map((x) => [x.no_agenda, x.nomor_surat, x.tgl_surat, x.jenis, x.tujuan, x.perihal, x.ttd, STATUS_OUT[x.status as StatusOut]]));
    } else if (jenis === 'disposisi') {
      const base = `FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id JOIN users fu ON fu.id=d.from_user_id LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=COALESCE(tu.unit_id,d.to_unit_id)
        WHERE d.created_at::date BETWEEN $1 AND $2 AND ${vi.sql}`;
      const pp = [...P, ...vi.params];
      tbl('Per pemberi disposisi', ['Pejabat', 'Jumlah'], (await db.all(`SELECT fu.nama AS n, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.count]));
      tbl('Per unit penerima', ['Unit', 'Jumlah'], (await db.all(`SELECT COALESCE(un.nama,'Tanpa unit') AS n, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.count]));
      tbl('Daftar disposisi', ['Tanggal', 'No. Agenda', 'Perihal', 'Dari', 'Kepada', 'Batas waktu', 'Status'],
        (await db.all(`SELECT d.created_at::date AS tgl, li.no_agenda, li.perihal, fu.nama AS dari, COALESCE(tu.nama,un.nama) AS ke, d.deadline, d.status ${base} ORDER BY d.id`, pp))
          .map((x) => [x.tgl, x.no_agenda, x.perihal, x.dari, x.ke, x.deadline, x.status]));
    } else if (jenis === 'tindak-lanjut') {
      const base = `FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id JOIN users p ON p.id=t.pic_user_id WHERE t.created_at::date BETWEEN $1 AND $2 AND ${vi.sql}`;
      const pp = [...P, ...vi.params];
      const st = (await db.one(`SELECT count(*) FILTER (WHERE t.status='SELESAI') AS selesai, count(*) FILTER (WHERE t.${OPEN_TASK} AND t.deadline >= current_date) AS proses,
          count(*) FILTER (WHERE t.${OPEN_TASK} AND t.deadline < current_date) AS terlambat, count(*) FILTER (WHERE t.status='DIBATALKAN') AS batal ${base}`, pp))!;
      tbl('Ringkasan', ['Status', 'Jumlah'], [['Selesai', st.selesai], ['Dalam proses', st.proses], ['Terlambat', st.terlambat], ['Dibatalkan', st.batal]]);
      tbl('Per penanggung jawab', ['Penanggung jawab', 'Tugas', 'Selesai'], (await db.all(`SELECT p.nama AS n, count(*) AS total, count(*) FILTER (WHERE t.status='SELESAI') AS s ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.total, x.s]));
      tbl('Daftar tugas', ['No. Agenda', 'Tugas', 'Penanggung jawab', 'Batas waktu', 'Progres', 'Status'],
        (await db.all(`SELECT li.no_agenda,t.judul,p.nama AS pic,t.deadline,t.progress,t.status ${base} ORDER BY t.id`, pp)).map((x) => [x.no_agenda, x.judul, x.pic, x.deadline, `${x.progress}%`, x.status]));
    } else {
      const rows = await db.all(
        `WITH l AS (
           SELECT li.id, li.status, li.selesai_at,
                  COALESCE((SELECT min(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status<>'DIKEMBALIKAN'), li.sla_due) AS dl
             FROM letters_in li WHERE li.tgl_diterima BETWEEN $1 AND $2 AND ${vi.sql}),
         lu AS (SELECT DISTINCT d.letter_in_id AS id, COALESCE(du.unit_id, d.to_unit_id) AS unit_id FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id WHERE d.status<>'DIKEMBALIKAN')
         SELECT un.nama AS unit, count(*) AS surat,
                count(*) FILTER (WHERE l.status IN ('SELESAI','DIARSIPKAN')) AS selesai,
                count(*) FILTER (WHERE (l.status IN ('SELESAI','DIARSIPKAN') AND l.selesai_at::date > l.dl) OR (l.status NOT IN ('SELESAI','DIARSIPKAN') AND l.dl < current_date)) AS terlambat
           FROM l JOIN lu ON lu.id=l.id JOIN units un ON un.id=lu.unit_id GROUP BY un.nama ORDER BY un.nama`, [...P, ...vi.params],
      );
      tbl('Kinerja per unit', ['Unit', 'Surat', 'Selesai', 'Terlambat', 'Ketepatan waktu'], rows.map((x) => [x.unit, x.surat, x.selesai, x.terlambat, `${Math.round(((x.surat - x.terlambat) / x.surat) * 100)}%`]));
    }
    return tables;
  },
});
