import { Router } from 'express';
import { one, all } from '../db.js';
import { wrap, int, dateStr, today, BULAN, oneOf, bad } from '../util.js';
import { visibleLettersIn, visibleLettersOut, is } from '../perm.js';
import { STATUS_IN } from '../cases.js';
import { slaIndicator } from '../sla.js';
import { STATUS_OUT } from './lettersOut.js';

const r = Router();

/* tenggat efektif surat (SQL): disposisi aktif terdekat, atau SLA */
const DL = `COALESCE((SELECT min(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')), li.sla_due)`;
const OPEN_IN = `li.status NOT IN ('SELESAI','DIARSIPKAN')`;

/* ---------- Dashboard ---------- */
r.get('/dashboard', wrap(async (req, res) => {
  const u = req.user;
  const vis = visibleLettersIn(u, 'li', 0);
  const year = new Date().getFullYear();
  const c = await one(
    `SELECT
       count(*) FILTER (WHERE EXTRACT(YEAR FROM li.tgl_diterima)=${year}) AS masuk_tahun_ini,
       count(*) FILTER (WHERE li.status='DITERIMA') AS belum_diteruskan,
       count(*) FILTER (WHERE li.status='MENUNGGU_DISPOSISI') AS menunggu_disposisi,
       count(*) FILTER (WHERE li.status IN ('DIDISPOSISIKAN','SEDANG_DIPROSES','MENUNGGU_PERSETUJUAN')) AS diproses,
       count(*) FILTER (WHERE li.status='MENUNGGU_KONFIRMASI') AS menunggu_konfirmasi,
       count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} < current_date) AS terlambat,
       count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} = current_date) AS jatuh_tempo_hari_ini,
       count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} BETWEEN current_date+1 AND current_date+2) AS mendekati,
       count(*) FILTER (WHERE li.status IN ('SELESAI','DIARSIPKAN') AND date_trunc('month', li.selesai_at)=date_trunc('month', now())) AS selesai_bulan_ini,
       count(*) FILTER (WHERE li.status IN ('SELESAI','DIARSIPKAN') AND li.selesai_at >= date_trunc('week', now())) AS selesai_minggu_ini,
       count(*) FILTER (WHERE li.tgl_diterima=current_date) AS masuk_hari_ini
     FROM letters_in li WHERE ${vis.sql}`, vis.params,
  );
  const out = { counts: c, role: u.role };

  const voutP = visibleLettersOut(u, 'lo', 0);
  const lo = await one(
    `SELECT count(*) FILTER (WHERE lo.status='MENUNGGU_PERSETUJUAN') AS menunggu_persetujuan,
            count(*) FILTER (WHERE lo.status='REVIEW') AS menunggu_review,
            count(*) FILTER (WHERE lo.status IN ('DRAFT','REVISI')) AS draft,
            count(*) FILTER (WHERE lo.status='NOMOR_DIBERIKAN') AS menunggu_ttd,
            count(*) FILTER (WHERE lo.status='DITANDATANGANI') AS menunggu_kirim,
            count(*) FILTER (WHERE EXTRACT(YEAR FROM lo.created_at)=${year}) AS keluar_tahun_ini
       FROM letters_out lo WHERE ${voutP.sql}`, voutP.params,
  );
  out.keluar = lo;

  if (is(u, 'pimpinan', 'superadmin')) {
    out.perlu_disposisi = await all(
      `SELECT li.id,li.no_agenda,li.perihal,li.asal,li.sifat,li.prioritas,li.tgl_diterima FROM letters_in li WHERE li.status='MENUNGGU_DISPOSISI' ORDER BY li.tgl_diterima, li.id LIMIT 6`,
    );
    out.tugas_perhatian = await all(
      `SELECT t.id,t.judul,t.deadline,t.status,p.nama AS pic_nama,li.no_agenda,
              (t.deadline < current_date) AS terlambat
         FROM tasks t JOIN users p ON p.id=t.pic_user_id JOIN letters_in li ON li.id=t.letter_in_id
        WHERE t.status NOT IN ('SELESAI','DIBATALKAN') AND t.deadline <= current_date + 2 ORDER BY t.deadline LIMIT 8`,
    );
    out.perlu_persetujuan = await all(
      `SELECT lo.id,lo.no_agenda,lo.perihal,lo.jenis,u.nama AS pembuat FROM letters_out lo JOIN users u ON u.id=lo.created_by WHERE lo.status='MENUNGGU_PERSETUJUAN' ORDER BY lo.updated_at LIMIT 6`,
    );
    out.tugas_terlambat = (await one(`SELECT count(*) AS n FROM tasks WHERE status NOT IN ('SELESAI','DIBATALKAN') AND deadline < current_date`)).n;
    out.tugas_mendekati = (await one(`SELECT count(*) AS n FROM tasks WHERE status NOT IN ('SELESAI','DIBATALKAN') AND deadline BETWEEN current_date AND current_date + 2`)).n;
    const masuk = await all(`SELECT EXTRACT(MONTH FROM tgl_diterima)::int AS m, count(*) AS n FROM letters_in WHERE EXTRACT(YEAR FROM tgl_diterima)=${year} GROUP BY 1`);
    const selesai = await all(`SELECT EXTRACT(MONTH FROM selesai_at)::int AS m, count(*) AS n FROM letters_in WHERE selesai_at IS NOT NULL AND EXTRACT(YEAR FROM selesai_at)=${year} GROUP BY 1`);
    out.per_bulan = BULAN.map((nama, i) => ({ bulan: nama.slice(0, 3), masuk: masuk.find((x) => x.m === i + 1)?.n || 0, selesai: selesai.find((x) => x.m === i + 1)?.n || 0 }));
    out.per_unit = await all(
      `SELECT COALESCE(un.nama,'Tanpa unit') AS unit, count(DISTINCT d.letter_in_id) AS jumlah
         FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id LEFT JOIN units un ON un.id=COALESCE(du.unit_id, d.to_unit_id)
        WHERE d.status <> 'DIKEMBALIKAN' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
    );
    out.rata_hari_selesai = (await one(`SELECT round(avg(EXTRACT(EPOCH FROM (selesai_at - created_at))/86400)::numeric, 1) AS d FROM letters_in WHERE selesai_at IS NOT NULL`)).d;
  }

  if (is(u, 'tu', 'superadmin')) {
    out.antrian_tu = await all(
      `SELECT li.id,li.no_agenda,li.perihal,li.asal,li.tgl_diterima FROM letters_in li WHERE li.status='DITERIMA' ORDER BY li.id LIMIT 6`,
    );
    out.nomor_terakhir = await one(`SELECT nomor_surat, no_agenda, id FROM letters_out WHERE nomor_surat IS NOT NULL ORDER BY id DESC LIMIT 1`);
    out.arsip_terbaru = await all(`SELECT li.id,li.no_agenda,li.perihal,li.arsip_at FROM letters_in li WHERE li.status='DIARSIPKAN' ORDER BY li.arsip_at DESC LIMIT 5`);
  }

  // Pekerjaan saya: untuk semua peran selain viewer
  if (!is(u, 'viewer')) {
    const t = await one(
      `SELECT
         count(*) FILTER (WHERE status IN ('BELUM_DIMULAI','DITERIMA')) AS belum,
         count(*) FILTER (WHERE status='DIPROSES') AS diproses,
         count(*) FILTER (WHERE status='MENUNGGU_DATA') AS menunggu_data,
         count(*) FILTER (WHERE status IN ('MENUNGGU_KONFIRMASI','MENUNGGU_PERSETUJUAN')) AS menunggu_lain,
         count(*) FILTER (WHERE status NOT IN ('SELESAI','DIBATALKAN') AND deadline BETWEEN current_date AND current_date+2) AS mendekati,
         count(*) FILTER (WHERE status NOT IN ('SELESAI','DIBATALKAN') AND deadline < current_date) AS terlambat,
         count(*) FILTER (WHERE status='SELESAI') AS selesai,
         count(*) FILTER (WHERE status NOT IN ('SELESAI','DIBATALKAN') AND (prioritas='Mendesak' OR deadline < current_date)) AS urgent,
         count(*) FILTER (WHERE status NOT IN ('SELESAI','DIBATALKAN') AND deadline = current_date) AS hari_ini,
         count(*) FILTER (WHERE status NOT IN ('SELESAI','DIBATALKAN') AND deadline BETWEEN current_date AND current_date+7) AS minggu_ini
       FROM tasks WHERE pic_user_id=$1`, [u.id],
    );
    out.tugas_saya = t;
    out.disposisi_baru = await all(
      `SELECT d.id,d.letter_in_id,d.instruksi,d.deadline,d.prioritas,li.no_agenda,li.perihal,fu.nama AS dari
         FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id JOIN users fu ON fu.id=d.from_user_id
        WHERE d.status='BARU' AND (d.to_user_id=$1 OR (d.to_unit_id=$2 AND $3)) ORDER BY d.deadline NULLS LAST LIMIT 6`,
      [u.id, u.unit_id ?? 0, u.role === 'pejabat'],
    );
    out.tugas_terdekat = (await all(
      `SELECT t.id,t.judul,t.deadline,t.status,t.progress,t.prioritas,li.no_agenda FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id
        WHERE t.pic_user_id=$1 AND t.status NOT IN ('SELESAI','DIBATALKAN') ORDER BY t.deadline NULLS LAST LIMIT 6`, [u.id],
    )).map((x) => ({ ...x, sla: slaIndicator(x.deadline) }));
  }
  res.json(out);
}));

/* ---------- Pencarian ---------- */
r.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const jenis = oneOf(req.query.jenis || 'semua', ['semua', 'masuk', 'keluar'], 'Jenis');
  const from = dateStr(req.query.from, 'Dari tanggal', { required: false });
  const to = dateStr(req.query.to, 'Sampai tanggal', { required: false });
  const status = req.query.status ? String(req.query.status) : null;
  const sifat = req.query.sifat ? String(req.query.sifat) : null;
  const prioritas = req.query.prioritas ? String(req.query.prioritas) : null;
  const unit = int(req.query.unit, 'Unit', { required: false });
  const pic = int(req.query.pic, 'PIC', { required: false });
  const tahun = int(req.query.tahun, 'Tahun', { required: false, min: 2000, max: 2100 });
  const results = [];

  if (jenis !== 'keluar') {
    const vis = visibleLettersIn(req.user, 'li', 0);
    const params = [...vis.params];
    const where = [vis.sql];
    const add = (cond, val) => { params.push(val); where.push(cond.replace(/\?/g, `$${params.length}`)); };
    if (q) {
      add(`(li.no_agenda ILIKE ? OR li.no_surat ILIKE ? OR li.perihal ILIKE ? OR li.asal ILIKE ? OR li.instansi ILIKE ? OR li.catatan ILIKE ?
          OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=li.id AND d.instruksi ILIKE ?)
          OR EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=li.id AND (t.judul ILIKE ? OR t.deskripsi ILIKE ?))
          OR EXISTS (SELECT 1 FROM attachments a WHERE a.letter_in_id=li.id AND a.nama ILIKE ?))`, `%${q}%`);
    }
    if (from) add('li.tgl_diterima >= ?', from);
    if (to) add('li.tgl_diterima <= ?', to);
    if (status) add('li.status = ?', status);
    if (sifat) add('li.sifat = ?', sifat);
    if (prioritas) add('li.prioritas = ?', prioritas);
    if (tahun) add('EXTRACT(YEAR FROM li.tgl_diterima) = ?', tahun);
    if (unit) add(`EXISTS (SELECT 1 FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id WHERE d.letter_in_id=li.id AND COALESCE(du.unit_id,d.to_unit_id)=?)`, unit);
    if (pic) add(`(EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=li.id AND t.pic_user_id=?) OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=li.id AND d.to_user_id=?))`, pic);
    const rows = await all(
      `SELECT li.id,li.no_agenda,li.no_surat AS nomor,li.perihal,li.asal AS pihak,li.tgl_diterima AS tanggal,li.status,li.sifat,li.prioritas,li.sla_due,
              ${DL} AS deadline FROM letters_in li WHERE ${where.join(' AND ')} ORDER BY li.id DESC LIMIT 100`, params,
    );
    for (const x of rows) results.push({ ...x, tipe: 'masuk', statusLabel: STATUS_IN[x.status], sla: slaIndicator(x.deadline, new Date(), ['SELESAI', 'DIARSIPKAN'].includes(x.status)) });
  }
  if (jenis !== 'masuk' && !sifat && !prioritas) {
    const vis = visibleLettersOut(req.user, 'lo', 0);
    const params = [...vis.params];
    const where = [vis.sql];
    const add = (cond, val) => { params.push(val); where.push(cond.replace(/\?/g, `$${params.length}`)); };
    if (q) add(`(lo.no_agenda ILIKE ? OR lo.nomor_surat ILIKE ? OR lo.perihal ILIKE ? OR lo.tujuan ILIKE ? OR lo.jenis ILIKE ? OR lo.fields::text ILIKE ?)`, `%${q}%`);
    if (from) add('lo.tgl_surat >= ?', from);
    if (to) add('lo.tgl_surat <= ?', to);
    if (status) add('lo.status = ?', status);
    if (tahun) add('EXTRACT(YEAR FROM lo.tgl_surat) = ?', tahun);
    if (unit) add('EXISTS (SELECT 1 FROM users cu WHERE cu.id=lo.created_by AND cu.unit_id=?)', unit);
    if (pic) add('lo.created_by = ?', pic);
    const rows = await all(
      `SELECT lo.id,lo.no_agenda,lo.nomor_surat AS nomor,lo.perihal,lo.tujuan AS pihak,lo.tgl_surat AS tanggal,lo.status,lo.jenis
         FROM letters_out lo WHERE ${where.join(' AND ')} ORDER BY lo.id DESC LIMIT 100`, params,
    );
    for (const x of rows) results.push({ ...x, tipe: 'keluar', statusLabel: STATUS_OUT[x.status] });
  }
  results.sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
  res.json(results);
}));

/* ---------- Arsip ---------- */
r.get('/arsip', wrap(async (req, res) => {
  const vi = visibleLettersIn(req.user, 'li', 0);
  const vo = visibleLettersOut(req.user, 'lo', 0);
  const masuk = await all(`SELECT EXTRACT(YEAR FROM li.tgl_diterima)::int AS tahun, EXTRACT(MONTH FROM li.tgl_diterima)::int AS bulan, count(*) AS n FROM letters_in li WHERE ${vi.sql} GROUP BY 1,2`, vi.params);
  const keluar = await all(`SELECT EXTRACT(YEAR FROM lo.tgl_surat)::int AS tahun, EXTRACT(MONTH FROM lo.tgl_surat)::int AS bulan, count(*) AS n FROM letters_out lo WHERE ${vo.sql} GROUP BY 1,2`, vo.params);
  const years = [...new Set([...masuk, ...keluar].map((x) => x.tahun))].sort((a, b) => b - a);
  res.json(years.map((tahun) => ({
    tahun,
    masuk: BULAN.map((nama, i) => ({ bulan: i + 1, nama, jumlah: masuk.find((x) => x.tahun === tahun && x.bulan === i + 1)?.n || 0 })),
    keluar: BULAN.map((nama, i) => ({ bulan: i + 1, nama, jumlah: keluar.find((x) => x.tahun === tahun && x.bulan === i + 1)?.n || 0 })),
  })));
}));

r.get('/arsip/daftar', wrap(async (req, res) => {
  const tahun = int(req.query.tahun, 'Tahun', { min: 2000, max: 2100 });
  const bulan = int(req.query.bulan, 'Bulan', { min: 1, max: 12 });
  const jenis = oneOf(req.query.jenis, ['masuk', 'keluar'], 'Jenis');
  if (jenis === 'masuk') {
    const v = visibleLettersIn(req.user, 'li', 2);
    res.json(await all(
      `SELECT li.id,li.no_agenda,li.no_surat AS nomor,li.perihal,li.asal AS pihak,li.tgl_diterima AS tanggal,li.status,
              (SELECT count(*) FROM attachments a WHERE a.letter_in_id=li.id) AS dokumen
         FROM letters_in li WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1 AND EXTRACT(MONTH FROM li.tgl_diterima)=$2 AND ${v.sql} ORDER BY li.tgl_diterima, li.id`,
      [tahun, bulan, ...v.params],
    ));
  } else {
    const v = visibleLettersOut(req.user, 'lo', 2);
    res.json(await all(
      `SELECT lo.id,lo.no_agenda,lo.nomor_surat AS nomor,lo.perihal,lo.tujuan AS pihak,lo.tgl_surat AS tanggal,lo.status,
              (SELECT count(*) FROM attachments a WHERE a.letter_out_id=lo.id) AS dokumen
         FROM letters_out lo WHERE EXTRACT(YEAR FROM lo.tgl_surat)=$1 AND EXTRACT(MONTH FROM lo.tgl_surat)=$2 AND ${v.sql} ORDER BY lo.tgl_surat, lo.id`,
      [tahun, bulan, ...v.params],
    ));
  }
}));

/* ---------- QR ---------- */
r.get('/qr/:token', wrap(async (req, res) => {
  const li = await one('SELECT id FROM letters_in WHERE qr_token=$1', [String(req.params.token).slice(0, 64)]);
  if (!li) return res.status(404).json({ error: 'Kode surat tidak dikenal' });
  res.json({ id: li.id });
}));

/* ---------- Laporan ---------- */
const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (t) => `﻿${[t.columns, ...t.rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

r.get('/laporan/:jenis', wrap(async (req, res) => {
  if (is(req.user, 'pelaksana')) return res.status(403).json({ error: 'Laporan tidak tersedia untuk peran Anda' });
  const jenis = oneOf(req.params.jenis, ['surat-masuk', 'surat-keluar', 'disposisi', 'tindak-lanjut', 'kinerja'], 'Jenis laporan');
  const year = new Date().getFullYear();
  const from = dateStr(req.query.from, 'Dari tanggal', { required: false }) || `${year}-01-01`;
  const to = dateStr(req.query.to, 'Sampai tanggal', { required: false }) || `${year}-12-31`;
  if (from > to) throw bad('Tanggal awal tidak boleh setelah tanggal akhir');
  const vi = visibleLettersIn(req.user, 'li', 2);
  const vo = visibleLettersOut(req.user, 'lo', 2);
  const P = [from, to];
  const tables = [];
  const tbl = (judul, columns, rows) => tables.push({ judul, columns, rows: rows.map((r2) => columns.map((_, i) => (Array.isArray(r2) ? r2[i] : Object.values(r2)[i]))) });
  let catatan = null;

  if (jenis === 'surat-masuk') {
    const base = `FROM letters_in li WHERE li.tgl_diterima BETWEEN $1 AND $2 AND ${vi.sql}`;
    const pp = [...P, ...vi.params];
    tbl('Per bulan', ['Bulan', 'Jumlah'], (await all(`SELECT to_char(li.tgl_diterima,'YYYY-MM') AS b, count(*) ${base} GROUP BY 1 ORDER BY 1`, pp)).map((x) => [x.b, x.count]));
    tbl('Per jenis', ['Jenis', 'Jumlah'], (await all(`SELECT li.jenis, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.jenis, x.count]));
    tbl('Per pengirim', ['Pengirim', 'Jumlah'], (await all(`SELECT li.asal, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC LIMIT 25`, pp)).map((x) => [x.asal, x.count]));
    tbl('Per unit tujuan disposisi', ['Unit', 'Jumlah surat'], (await all(
      `SELECT COALESCE(un.nama,'Belum didisposisikan') AS unit, count(DISTINCT li.id) AS n FROM letters_in li
         LEFT JOIN dispositions d ON d.letter_in_id=li.id AND d.status<>'DIKEMBALIKAN' LEFT JOIN users du ON du.id=d.to_user_id LEFT JOIN units un ON un.id=COALESCE(du.unit_id,d.to_unit_id)
        WHERE li.tgl_diterima BETWEEN $1 AND $2 AND ${vi.sql} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.unit, x.n]));
    tbl('Daftar surat masuk', ['No. Agenda', 'No. Surat', 'Tanggal diterima', 'Asal', 'Perihal', 'Sifat', 'Prioritas', 'Status'],
      (await all(`SELECT li.no_agenda,li.no_surat,li.tgl_diterima,li.asal,li.perihal,li.sifat,li.prioritas,li.status ${base} ORDER BY li.id`, pp)).map((x) => [x.no_agenda, x.no_surat, x.tgl_diterima, x.asal, x.perihal, x.sifat, x.prioritas, STATUS_IN[x.status]]));
  } else if (jenis === 'surat-keluar') {
    const base = `FROM letters_out lo JOIN users cu ON cu.id=lo.created_by LEFT JOIN users sg ON sg.id=lo.penandatangan_id WHERE lo.tgl_surat BETWEEN $1 AND $2 AND ${vo.sql}`;
    const pp = [...P, ...vo.params];
    tbl('Per bulan', ['Bulan', 'Jumlah'], (await all(`SELECT to_char(lo.tgl_surat,'YYYY-MM') AS b, count(*) ${base} GROUP BY 1 ORDER BY 1`, pp)).map((x) => [x.b, x.count]));
    tbl('Per jenis', ['Jenis', 'Jumlah'], (await all(`SELECT lo.jenis, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.jenis, x.count]));
    tbl('Per penandatangan', ['Penandatangan', 'Jumlah'], (await all(`SELECT COALESCE(sg.nama,'Belum ditentukan') AS n, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.count]));
    tbl('Daftar surat keluar', ['No. Agenda', 'Nomor surat', 'Tanggal', 'Jenis', 'Tujuan', 'Perihal', 'Penandatangan', 'Status'],
      (await all(`SELECT lo.no_agenda,lo.nomor_surat,lo.tgl_surat,lo.jenis,lo.tujuan,lo.perihal,sg.nama AS ttd,lo.status ${base} ORDER BY lo.id`, pp)).map((x) => [x.no_agenda, x.nomor_surat, x.tgl_surat, x.jenis, x.tujuan, x.perihal, x.ttd, STATUS_OUT[x.status]]));
  } else if (jenis === 'disposisi') {
    const base = `FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id JOIN users fu ON fu.id=d.from_user_id LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=COALESCE(tu.unit_id,d.to_unit_id)
      WHERE d.created_at::date BETWEEN $1 AND $2 AND ${vi.sql}`;
    const pp = [...P, ...vi.params];
    tbl('Per pemberi disposisi', ['Pejabat', 'Jumlah'], (await all(`SELECT fu.nama AS n, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.count]));
    tbl('Per unit penerima', ['Unit', 'Jumlah'], (await all(`SELECT COALESCE(un.nama,'Tanpa unit') AS n, count(*) ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.count]));
    tbl('Daftar disposisi', ['Tanggal', 'No. Agenda', 'Perihal', 'Dari', 'Kepada', 'Batas waktu', 'Status'],
      (await all(`SELECT d.created_at::date AS tgl, li.no_agenda, li.perihal, fu.nama AS dari, COALESCE(tu.nama,un.nama) AS ke, d.deadline, d.status ${base} ORDER BY d.id`, pp)).map((x) => [x.tgl, x.no_agenda, x.perihal, x.dari, x.ke, x.deadline, x.status]));
  } else if (jenis === 'tindak-lanjut') {
    const base = `FROM tasks t JOIN letters_in li ON li.id=t.letter_in_id JOIN users p ON p.id=t.pic_user_id WHERE t.created_at::date BETWEEN $1 AND $2 AND ${vi.sql}`;
    const pp = [...P, ...vi.params];
    const st = await one(`SELECT count(*) FILTER (WHERE t.status='SELESAI') AS selesai, count(*) FILTER (WHERE t.status NOT IN ('SELESAI','DIBATALKAN') AND t.deadline >= current_date) AS proses,
        count(*) FILTER (WHERE t.status NOT IN ('SELESAI','DIBATALKAN') AND t.deadline < current_date) AS terlambat, count(*) FILTER (WHERE t.status='DIBATALKAN') AS batal ${base}`, pp);
    tbl('Ringkasan', ['Status', 'Jumlah'], [['Selesai', st.selesai], ['Dalam proses', st.proses], ['Terlambat', st.terlambat], ['Dibatalkan', st.batal]]);
    tbl('Per penanggung jawab', ['PIC', 'Tugas', 'Selesai'], (await all(`SELECT p.nama AS n, count(*) AS total, count(*) FILTER (WHERE t.status='SELESAI') AS s ${base} GROUP BY 1 ORDER BY 2 DESC`, pp)).map((x) => [x.n, x.total, x.s]));
    tbl('Daftar tugas', ['No. Agenda', 'Tugas', 'PIC', 'Batas waktu', 'Progres', 'Status'],
      (await all(`SELECT li.no_agenda,t.judul,p.nama AS pic,t.deadline,t.progress,t.status ${base} ORDER BY t.id`, pp)).map((x) => [x.no_agenda, x.judul, x.pic, x.deadline, `${x.progress}%`, x.status]));
  } else {
    catatan = 'Terlambat: surat selesai setelah tenggat, atau belum selesai dan tenggatnya sudah lewat. SLA = (surat tidak terlambat) / (jumlah surat). Tenggat = batas waktu disposisi terdekat, atau SLA prioritas bila belum ada disposisi.';
    const rows = await all(
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
    tbl('Kinerja per unit', ['Unit', 'Surat', 'Selesai', 'Terlambat', 'SLA'], rows.map((x) => [x.unit, x.surat, x.selesai, x.terlambat, `${Math.round(((x.surat - x.terlambat) / x.surat) * 100)}%`]));
  }

  if (req.query.format === 'csv') {
    const idx = Math.min(int(req.query.tabel, 'Tabel', { required: false, min: 0 }) || tables.length - 1, tables.length - 1);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-${jenis}-${from}_${to}.csv"`);
    return res.send(toCsv(tables[idx]));
  }
  res.json({ jenis, from, to, tables, catatan });
}));

/* Statistik tahunan untuk halaman laporan */
r.get('/statistik', wrap(async (req, res) => {
  const tahun = int(req.query.tahun, 'Tahun', { required: false, min: 2000, max: 2100 }) || new Date().getFullYear();
  const vi = visibleLettersIn(req.user, 'li', 1);
  const vo = visibleLettersOut(req.user, 'lo', 1);
  const a = await one(
    `SELECT count(*) AS masuk, count(*) FILTER (WHERE li.status IN ('SELESAI','DIARSIPKAN')) AS selesai,
            count(*) FILTER (WHERE ${OPEN_IN} AND ${DL} < current_date) AS terlambat
       FROM letters_in li WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1 AND ${vi.sql}`, [tahun, ...vi.params],
  );
  const k = await one(`SELECT count(*) AS keluar FROM letters_out lo WHERE EXTRACT(YEAR FROM lo.tgl_surat)=$1 AND ${vo.sql}`, [tahun, ...vo.params]);
  const d = await one(`SELECT count(*) AS n FROM dispositions d JOIN letters_in li ON li.id=d.letter_in_id WHERE EXTRACT(YEAR FROM li.tgl_diterima)=$1 AND ${vi.sql}`, [tahun, ...vi.params]);
  res.json({ tahun, ...a, ...k, disposisi: d.n });
}));

export default r;
