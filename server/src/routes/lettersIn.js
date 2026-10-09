import { Router } from 'express';
import QRCode from 'qrcode';
import crypto from 'node:crypto';
import { one, all, tx } from '../db.js';
import { wrap, str, oneOf, dateStr, int, bad, forbidden, notFound, conflict, today } from '../util.js';
import { audit, event, notify, nextSeq } from '../record.js';
import { upload } from '../storage.js';
import { saveAttachment, ATT_SELECT, KATEGORI_IN } from '../attachments.js';
import { visibleLettersIn, canManageIn, canDispose, canAssign, is, requireRole } from '../perm.js';
import { slaDueFor } from '../sla.js';
import { pageParams, csvList, sendCsv, runBulk } from '../listing.js';
import { newTrackCode, formatTrackCode } from '../tracking.js';
import { loadLetterIn, recomputeStatus, stagesFor, completionChecks, effectiveDeadline, indicatorFor, holdsDisposition, STATUS_IN } from '../cases.js';

const r = Router();
const SIFAT = ['Biasa', 'Segera', 'Penting', 'Rahasia'];
const PRIORITAS = ['Rendah', 'Normal', 'Tinggi', 'Mendesak'];
const TINDAKAN = ['Untuk diketahui', 'Untuk ditindaklanjuti', 'Untuk dikoordinasikan', 'Untuk disiapkan jawaban', 'Untuk dibuatkan surat', 'Untuk dilaporkan kembali'];
const METODE = ['Surat resmi', 'Email', 'WhatsApp', 'Telepon', 'Tatap muka', 'Sistem/aplikasi', 'Lainnya'];

const base = (req) => `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;

/* ---------- Daftar, id massal, ekspor ---------- */
const DL = `COALESCE((SELECT min(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')), li.sla_due)`;
const OPEN = `li.status NOT IN ('SELESAI','DIARSIPKAN')`;
const SORTS = {
  tgl: 'li.tgl_diterima', agenda: 'li.id', perihal: 'li.perihal', asal: 'li.asal', status: 'li.status', tenggat: DL, sifat: 'li.sifat',
};

function inFilter(req) {
  const vis = visibleLettersIn(req.user, 'li', 0);
  const params = [...vis.params];
  const where = [vis.sql];
  const add = (cond, val) => { params.push(val); where.push(cond.replace(/\?/g, `$${params.length}`)); };
  const f = req.query;
  const status = csvList(f.status);
  if (status.length) add('li.status = ANY(?)', status);
  const sifat = csvList(f.sifat);
  if (sifat.length) add('li.sifat = ANY(?)', sifat);
  const prio = csvList(f.prioritas);
  if (prio.length) add('li.prioritas = ANY(?)', prio);
  if (f.from) add('li.tgl_diterima >= ?', dateStr(f.from, 'Dari tanggal'));
  if (f.to) add('li.tgl_diterima <= ?', dateStr(f.to, 'Sampai tanggal'));
  if (f.unit) add(`EXISTS (SELECT 1 FROM dispositions d LEFT JOIN users du ON du.id=d.to_user_id WHERE d.letter_in_id=li.id AND d.status<>'DIKEMBALIKAN' AND COALESCE(du.unit_id,d.to_unit_id)=?)`, int(f.unit, 'Unit'));
  if (f.pic) add(`(EXISTS (SELECT 1 FROM tasks t WHERE t.letter_in_id=li.id AND t.pic_user_id=?) OR EXISTS (SELECT 1 FROM dispositions d WHERE d.letter_in_id=li.id AND d.to_user_id=? AND d.status<>'DIKEMBALIKAN'))`, int(f.pic, 'PIC'));
  if (f.q) add(`(li.no_agenda ILIKE ? OR li.no_surat ILIKE ? OR li.perihal ILIKE ? OR li.asal ILIKE ? OR li.instansi ILIKE ?)`, `%${String(f.q).slice(0, 100)}%`);
  if (f.antrian === 'belum_diteruskan') where.push(`li.status = 'DITERIMA'`);
  if (f.antrian === 'terlambat') where.push(`${OPEN} AND ${DL} < current_date`);
  if (f.antrian === 'mendekati') where.push(`${OPEN} AND ${DL} BETWEEN current_date AND current_date + 2`);
  return { sql: where.join(' AND '), params };
}

const decorate = (l) => {
  const deadline = effectiveDeadline(l, l.deadlines || []);
  return { ...l, deadlines: undefined, statusLabel: STATUS_IN[l.status], deadline, sla: indicatorFor(l, deadline) };
};

r.get('/', wrap(async (req, res) => {
  const w = inFilter(req);
  const pg = pageParams(req.query, { sorts: SORTS, defaultSort: 'agenda' });
  const cols = `li.id,li.no_agenda,li.no_surat,li.tgl_surat,li.tgl_diterima,li.asal,li.instansi,li.perihal,li.sifat,li.prioritas,li.status,li.sla_due,
      (SELECT array_agg(d.deadline) FROM dispositions d WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')) AS deadlines,
      (SELECT string_agg(DISTINCT COALESCE(u.nama, un.nama), ', ') FROM dispositions d
         LEFT JOIN users u ON u.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id
        WHERE d.letter_in_id=li.id AND d.status IN ('BARU','DITERIMA')) AS pic`;
  if (req.query.format === 'csv') {
    const rows = (await all(`SELECT ${cols} FROM letters_in li WHERE ${w.sql} ORDER BY ${pg.orderBy} LIMIT 5000`, w.params)).map(decorate);
    return sendCsv(res, `surat-masuk-${today()}.csv`, ['No. Agenda', 'No. Surat', 'Tanggal surat', 'Tanggal diterima', 'Asal', 'Instansi', 'Perihal', 'Sifat', 'Prioritas', 'Status', 'Posisi', 'Tenggat'],
      rows.map((l) => [l.no_agenda, l.no_surat, l.tgl_surat, l.tgl_diterima, l.asal, l.instansi, l.perihal, l.sifat, l.prioritas, l.statusLabel, l.pic, l.deadline]));
  }
  const rows = await all(`SELECT ${cols} FROM letters_in li WHERE ${w.sql} ORDER BY ${pg.orderBy}, li.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
  const total = (await one(`SELECT count(*) AS n FROM letters_in li WHERE ${w.sql}`, w.params)).n;
  res.json({ items: rows.map(decorate), total, page: pg.page, pageSize: pg.pageSize });
}));

/** Semua id yang cocok dengan saringan (maks 500), untuk "pilih semua hasil" lintas halaman. */
r.get('/ids', wrap(async (req, res) => {
  const w = inFilter(req);
  const total = (await one(`SELECT count(*) AS n FROM letters_in li WHERE ${w.sql}`, w.params)).n;
  const ids = (await all(`SELECT li.id FROM letters_in li WHERE ${w.sql} ORDER BY li.id DESC LIMIT 500`, w.params)).map((x) => x.id);
  res.json({ ids, total, terpotong: total > ids.length });
}));

/* ---------- Aksi massal ---------- */
r.post('/bulk/teruskan', requireRole('superadmin', 'tu'), wrap(async (req, res) => {
  res.json(await runBulk(req.body.ids, (id) => doTeruskan(req, id)));
}));
r.post('/bulk/disposisi', wrap(async (req, res) => {
  if (!canDispose(req.user)) throw forbidden('Hanya pimpinan yang dapat memberi disposisi massal');
  res.json(await runBulk(req.body.ids, (id) => doDisposisi(req, id, req.body)));
}));
r.post('/bulk/arsipkan', requireRole('superadmin', 'tu'), wrap(async (req, res) => {
  res.json(await runBulk(req.body.ids, (id) => doArsip(req, id)));
}));

/* ---------- Catat surat masuk ---------- */
r.post('/', requireRole('superadmin', 'tu'), upload.array('files', 10), wrap(async (req, res) => {
  const b = req.body;
  const data = {
    no_surat: str(b.no_surat, 'Nomor surat', { max: 120 }),
    tgl_surat: dateStr(b.tgl_surat, 'Tanggal surat'),
    tgl_diterima: dateStr(b.tgl_diterima, 'Tanggal diterima'),
    asal: str(b.asal, 'Asal surat', { max: 200 }),
    instansi: str(b.instansi, 'Instansi', { max: 200, required: false }),
    alamat: str(b.alamat, 'Alamat pengirim', { max: 400, required: false }),
    perihal: str(b.perihal, 'Perihal', { max: 500 }),
    jenis: str(b.jenis, 'Jenis surat', { max: 60, required: false }) || 'Surat Dinas',
    sifat: oneOf(b.sifat || 'Biasa', SIFAT, 'Sifat surat'),
    prioritas: oneOf(b.prioritas || 'Normal', PRIORITAS, 'Prioritas'),
    lampiran: str(b.lampiran, 'Lampiran', { max: 200, required: false }),
    catatan: str(b.catatan, 'Catatan penerimaan', { max: 1000, required: false }),
  };
  if (data.tgl_diterima < data.tgl_surat) throw bad('Tanggal diterima tidak boleh sebelum tanggal surat');
  const files = req.files || [];
  const out = await tx(async (db) => {
    const year = data.tgl_diterima.slice(0, 4);
    const seq = await nextSeq(db, `SM-${year}`);
    const no_agenda = `SM-${year}-${String(seq).padStart(6, '0')}`;
    const case_no = `CASE-${year}-${String(seq).padStart(6, '0')}`;
    const sla_due = await slaDueFor(data.prioritas, data.tgl_diterima);
    const qr_token = crypto.randomBytes(12).toString('base64url');
    const li = await db.one(
      `INSERT INTO letters_in(no_agenda,case_no,no_surat,tgl_surat,tgl_diterima,asal,instansi,alamat,perihal,jenis,sifat,prioritas,lampiran,catatan,sla_due,qr_token,created_by,track_code,track_enabled)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id,no_agenda,case_no`,
      [no_agenda, case_no, data.no_surat, data.tgl_surat, data.tgl_diterima, data.asal, data.instansi, data.alamat, data.perihal, data.jenis, data.sifat, data.prioritas, data.lampiran, data.catatan, sla_due, qr_token, req.user.id, newTrackCode(), data.sifat !== 'Rahasia'],
    );
    for (const f of files) await saveAttachment(db, { file: f, kategori: 'SURAT', letterInId: li.id, userId: req.user.id });
    await event(db, { letterInId: li.id, userId: req.user.id, tipe: 'diterima', teks: `Surat diterima dan diregistrasi dengan nomor agenda ${no_agenda}` });
    await audit(db, req, 'SURAT_MASUK_DIBUAT', 'letter_in', li.id, { no_agenda, perihal: data.perihal, berkas: files.length });
    return li;
  });
  res.status(201).json(out);
}));

/* ---------- Detail ---------- */
r.get('/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const li = await loadLetterIn({ one, all }, req.user, id);
  const dispositions = await all(
    `SELECT d.*, fu.nama AS dari_nama, fu.jabatan AS dari_jabatan, tu.nama AS ke_nama, tu.jabatan AS ke_jabatan, un.nama AS ke_unit
       FROM dispositions d JOIN users fu ON fu.id=d.from_user_id LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id
      WHERE d.letter_in_id=$1 ORDER BY d.id`, [id],
  );
  const tasks = await all(
    `SELECT t.*, p.nama AS pic_nama, a.nama AS assigner_nama FROM tasks t JOIN users p ON p.id=t.pic_user_id JOIN users a ON a.id=t.assigner_id
      WHERE t.letter_in_id=$1 ORDER BY t.id`, [id],
  );
  const showFiles = !(req.user.role === 'viewer');
  const attachments = showFiles ? await all(`${ATT_SELECT} WHERE a.letter_in_id=$1 ORDER BY a.created_at`, [id]) : [];
  const confirmations = await all(
    `SELECT c.*, u.nama AS user_nama FROM confirmations c JOIN users u ON u.id=c.user_id WHERE c.letter_in_id=$1 ORDER BY c.id`, [id],
  );
  const outs = await all(`SELECT id,no_agenda,nomor_surat,perihal,status FROM letters_out WHERE letter_in_id=$1 ORDER BY id`, [id]);
  const creator = await one('SELECT nama FROM users WHERE id=$1', [li.created_by]);
  const { stages, percent } = await stagesFor(li);
  const syarat = await completionChecks(id);
  const activeDeadlines = dispositions.filter((d) => ['BARU', 'DITERIMA'].includes(d.status)).map((d) => d.deadline);
  const deadline = effectiveDeadline(li, activeDeadlines);
  const finished = ['SELESAI', 'DIARSIPKAN'].includes(li.status);
  const holds = dispositions.filter((d) => holdsDisposition(req.user, d));
  const myOpen = holds.filter((d) => d.status === 'BARU');
  const can = {
    edit: canManageIn(req.user) && ['DITERIMA', 'MENUNGGU_DISPOSISI'].includes(li.status),
    forward: canManageIn(req.user) && li.status === 'DITERIMA',
    disposisi: !finished && (canDispose(req.user) || holds.length > 0),
    terima: myOpen.length > 0,
    tugaskan: !finished && (canAssign(req.user) && (is(req.user, 'superadmin', 'pimpinan') || holds.length > 0)),
    balas: !finished && !is(req.user, 'viewer') && (canManageIn(req.user) || is(req.user, 'pejabat', 'pelaksana') || canDispose(req.user)),
    upload: !finished && !is(req.user, 'viewer'),
    komentar: !is(req.user, 'viewer'),
    konfirmasi: !finished && !is(req.user, 'viewer') && (!is(req.user, 'pelaksana') || tasks.some((t) => t.pic_user_id === req.user.id)),
    selesaikan: !finished && is(req.user, 'superadmin', 'tu', 'pimpinan', 'pejabat'),
    arsipkan: li.status === 'SELESAI' && canManageIn(req.user),
    cetak: canManageIn(req.user) || canDispose(req.user) || holds.length > 0,
  };
  res.json({
    letter: { ...li, creator_nama: creator?.nama, statusLabel: STATUS_IN[li.status] },
    dispositions, tasks, attachments, confirmations, outs, stages, percent, syarat,
    deadline, sla: indicatorFor(li, deadline), can,
    holds: holds.map((d) => d.id),
  });
}));

r.get('/:id/timeline', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  await loadLetterIn({ one, all }, req.user, id);
  const rows = await all(
    `SELECT e.id,e.tipe,e.teks,e.meta,e.created_at,e.letter_out_id,u.nama AS user_nama
       FROM events e LEFT JOIN users u ON u.id=e.user_id
      WHERE e.letter_in_id=$1 OR e.letter_out_id IN (SELECT id FROM letters_out WHERE letter_in_id=$1)
      ORDER BY e.created_at, e.id`, [id],
  );
  res.json(rows);
}));

r.get('/:id/qr', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const li = await loadLetterIn({ one, all }, req.user, id);
  const url = `${base(req)}/s/${li.qr_token}`;
  res.json({ url, dataUrl: await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }) });
}));

/* ---------- Ubah metadata ---------- */
r.put('/:id', requireRole('superadmin', 'tu'), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (!['DITERIMA', 'MENUNGGU_DISPOSISI'].includes(li.status)) throw conflict('Data surat tidak dapat diubah setelah didisposisikan');
    const d = {
      no_surat: str(b.no_surat, 'Nomor surat', { max: 120 }),
      tgl_surat: dateStr(b.tgl_surat, 'Tanggal surat'),
      asal: str(b.asal, 'Asal surat', { max: 200 }),
      instansi: str(b.instansi, 'Instansi', { max: 200, required: false }),
      alamat: str(b.alamat, 'Alamat pengirim', { max: 400, required: false }),
      perihal: str(b.perihal, 'Perihal', { max: 500 }),
      sifat: oneOf(b.sifat, SIFAT, 'Sifat surat'),
      prioritas: oneOf(b.prioritas, PRIORITAS, 'Prioritas'),
      lampiran: str(b.lampiran, 'Lampiran', { max: 200, required: false }),
      catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }),
    };
    const sla_due = await slaDueFor(d.prioritas, li.tgl_diterima);
    await db.q(
      `UPDATE letters_in SET no_surat=$1,tgl_surat=$2,asal=$3,instansi=$4,alamat=$5,perihal=$6,sifat=$7,prioritas=$8,lampiran=$9,catatan=$10,sla_due=$11,updated_at=now() WHERE id=$12`,
      [d.no_surat, d.tgl_surat, d.asal, d.instansi, d.alamat, d.perihal, d.sifat, d.prioritas, d.lampiran, d.catatan, sla_due, id],
    );
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'ubah', teks: 'Data surat diperbarui' });
    await audit(db, req, 'SURAT_MASUK_DIUBAH', 'letter_in', id, d);
  });
  res.json({ ok: true });
}));

/* ---------- Teruskan ke pimpinan ---------- */
async function doTeruskan(req, id) {
  await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (li.status !== 'DITERIMA') throw conflict('Surat sudah diteruskan');
    await db.q(`UPDATE letters_in SET status='MENUNGGU_DISPOSISI', diteruskan_at=now(), updated_at=now() WHERE id=$1`, [id]);
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'diteruskan', teks: 'Diteruskan kepada pimpinan, menunggu disposisi' });
    const leaders = await db.all(`SELECT id FROM users WHERE role='pimpinan' AND aktif`);
    await notify(db, leaders.map((u) => u.id), { tipe: 'disposisi', judul: 'Surat menunggu disposisi Anda', isi: `${li.no_agenda}: ${li.perihal}`, link: `/surat-masuk/${id}` });
    await audit(db, req, 'SURAT_DITERUSKAN', 'letter_in', id);
  });
}

r.post('/:id/teruskan', requireRole('superadmin', 'tu'), wrap(async (req, res) => {
  await doTeruskan(req, int(req.params.id, 'ID'));
  res.json({ ok: true });
}));

/* ---------- Disposisi (pimpinan atau penerus) ---------- */
async function doDisposisi(req, id, b) {
  const toUsers = (Array.isArray(b.to_user_ids) ? b.to_user_ids : []).map((x) => int(x, 'Penerima'));
  const toUnits = (Array.isArray(b.to_unit_ids) ? b.to_unit_ids : []).map((x) => int(x, 'Unit'));
  if (toUsers.length + toUnits.length === 0) throw bad('Pilih minimal satu penerima disposisi');
  const tindakan = (Array.isArray(b.tindakan) ? b.tindakan : []).filter((t) => TINDAKAN.includes(t));
  if (tindakan.length === 0) throw bad('Pilih minimal satu tindakan');
  const instruksi = str(b.instruksi, 'Instruksi', { max: 1500 });
  const deadline = dateStr(b.deadline, 'Batas waktu');
  const prioritas = oneOf(b.prioritas || 'Normal', ['Normal', 'Tinggi', 'Mendesak'], 'Prioritas');
  const parentId = int(b.parent_id, 'Disposisi induk', { required: false });
  await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (['SELESAI', 'DIARSIPKAN'].includes(li.status)) throw conflict('Surat sudah selesai');
    if (deadline < today()) throw bad('Batas waktu tidak boleh sebelum hari ini');
    let parent = null;
    if (parentId) {
      parent = await db.one('SELECT * FROM dispositions WHERE id=$1 AND letter_in_id=$2 FOR UPDATE', [parentId, id]);
      if (!parent) throw notFound('Disposisi induk tidak ditemukan');
    }
    const may = canDispose(req.user) || (parent && holdsDisposition(req.user, parent) && is(req.user, 'pejabat'));
    if (!may) throw forbidden('Hanya pimpinan atau penerima disposisi (pejabat) yang dapat meneruskan');
    for (const uid of toUsers) {
      if (!(await db.one('SELECT 1 FROM users WHERE id=$1 AND aktif', [uid]))) throw bad('Penerima tidak valid');
    }
    for (const un of toUnits) {
      if (!(await db.one('SELECT 1 FROM units WHERE id=$1 AND aktif', [un]))) throw bad('Unit tidak valid');
    }
    const created = [];
    const targets = [...toUsers.map((u) => ({ u })), ...toUnits.map((n) => ({ n }))];
    for (const t of targets) {
      const d = await db.one(
        `INSERT INTO dispositions(letter_in_id,parent_id,from_user_id,to_user_id,to_unit_id,tindakan,instruksi,deadline,prioritas)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [id, parentId, req.user.id, t.u ?? null, t.n ?? null, tindakan, instruksi, deadline, prioritas],
      );
      created.push(d.id);
      let recipients = [];
      let label = '';
      if (t.u) {
        recipients = [t.u];
        label = (await db.one('SELECT nama FROM users WHERE id=$1', [t.u])).nama;
      } else {
        const unit = await db.one('SELECT nama FROM units WHERE id=$1', [t.n]);
        label = unit.nama;
        const heads = await db.all(`SELECT id FROM users WHERE unit_id=$1 AND aktif AND role='pejabat'`, [t.n]);
        recipients = heads.length ? heads.map((x) => x.id) : (await db.all(`SELECT id FROM users WHERE unit_id=$1 AND aktif`, [t.n])).map((x) => x.id);
      }
      await notify(db, recipients, { tipe: 'disposisi', judul: 'Anda menerima disposisi baru', isi: `${li.no_agenda}: ${li.perihal}. Batas waktu ${deadline}`, link: `/surat-masuk/${id}` }, req.user.id);
      await event(db, { letterInId: id, userId: req.user.id, tipe: parentId ? 'forward' : 'disposisi', teks: `${parentId ? 'Disposisi diteruskan' : 'Disposisi diberikan'} kepada ${label}`, meta: { disposition_id: d.id, tindakan, deadline } });
    }
    if (parent) await db.q(`UPDATE dispositions SET status='DITERUSKAN' WHERE id=$1 AND status IN ('BARU','DITERIMA')`, [parentId]);
    await db.q(`UPDATE letters_in SET diteruskan_at=COALESCE(diteruskan_at, now()) WHERE id=$1`, [id]);
    if (li.status === 'DITERIMA' || li.status === 'MENUNGGU_DISPOSISI') await db.q(`UPDATE letters_in SET status='DIDISPOSISIKAN' WHERE id=$1`, [id]);
    await recomputeStatus(db, id);
    await audit(db, req, parentId ? 'DISPOSISI_DITERUSKAN' : 'DISPOSISI_DIBERIKAN', 'letter_in', id, { disposisi: created, tindakan, deadline });
  });
}

r.post('/:id/disposisi', wrap(async (req, res) => {
  await doDisposisi(req, int(req.params.id, 'ID'), req.body);
  res.status(201).json({ ok: true });
}));

/* ---------- Tugas ---------- */
r.post('/:id/tugas', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  const judul = str(b.judul, 'Judul tugas', { max: 200 });
  const deskripsi = str(b.deskripsi, 'Deskripsi', { max: 2000, required: false });
  const pic = int(b.pic_user_id, 'Penanggung jawab');
  const deadline = dateStr(b.deadline, 'Batas waktu');
  const start = dateStr(b.start_date, 'Tanggal mulai', { required: false }) || today();
  const prioritas = oneOf(b.prioritas || 'Normal', PRIORITAS, 'Prioritas');
  const dispId = int(b.disposition_id, 'Disposisi', { required: false });
  const checklist = (Array.isArray(b.checklist) ? b.checklist : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 30).map((teks) => ({ teks: teks.slice(0, 200), selesai: false }));
  if (deadline < start) throw bad('Batas waktu tidak boleh sebelum tanggal mulai');
  const out = await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (['SELESAI', 'DIARSIPKAN'].includes(li.status)) throw conflict('Surat sudah selesai');
    const ds = await db.all('SELECT * FROM dispositions WHERE letter_in_id=$1', [id]);
    const holds = ds.some((d) => holdsDisposition(req.user, d));
    if (!(is(req.user, 'superadmin', 'pimpinan') || (is(req.user, 'pejabat') && holds))) throw forbidden('Hanya pimpinan atau pejabat penerima disposisi yang dapat menugaskan');
    const picUser = await db.one('SELECT id,nama FROM users WHERE id=$1 AND aktif', [pic]);
    if (!picUser) throw bad('Penanggung jawab tidak valid');
    if (dispId && !ds.some((d) => d.id === dispId)) throw bad('Disposisi tidak terkait surat ini');
    const t = await db.one(
      `INSERT INTO tasks(letter_in_id,disposition_id,judul,deskripsi,pic_user_id,assigner_id,start_date,deadline,prioritas,checklist)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [id, dispId, judul, deskripsi, pic, req.user.id, start, deadline, prioritas, JSON.stringify(checklist)],
    );
    // Pelaksana yang ditugaskan langsung otomatis menjadi pemegang surat; surat dianggap diproses.
    await db.q(`UPDATE dispositions SET accepted_at=COALESCE(accepted_at, now()), status=CASE WHEN status='BARU' THEN 'DITERIMA' ELSE status END WHERE letter_in_id=$1 AND to_user_id=$2`, [id, req.user.id]);
    await notify(db, [pic], { tipe: 'tugas', judul: 'Anda menerima tugas baru', isi: `${judul} (${li.no_agenda}). Batas waktu ${deadline}`, link: `/tugas/${t.id}` }, req.user.id);
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'tugas', teks: `Tugas "${judul}" diberikan kepada ${picUser.nama}`, meta: { task_id: t.id, deadline } });
    await recomputeStatus(db, id);
    await audit(db, req, 'TUGAS_DIBUAT', 'task', t.id, { letter: id, pic, deadline });
    return t;
  });
  res.status(201).json(out);
}));

/* ---------- Unggah dokumen ---------- */
r.post('/:id/lampiran', upload.array('files', 10), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const kategori = oneOf(req.body.kategori || 'PENDUKUNG', KATEGORI_IN.filter((k) => !['SURAT', 'DISPOSISI'].includes(k) || canManageIn(req.user)), 'Kategori');
  const files = req.files || [];
  if (files.length === 0) throw bad('Pilih file yang akan diunggah');
  const taskId = int(req.body.task_id, 'Tugas', { required: false });
  const out = await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (is(req.user, 'viewer')) throw forbidden();
    if (['DIARSIPKAN'].includes(li.status)) throw conflict('Surat sudah diarsipkan');
    const saved = [];
    for (const f of files) {
      const a = await saveAttachment(db, { file: f, kategori, letterInId: id, taskId, userId: req.user.id });
      saved.push(a);
      await event(db, { letterInId: id, userId: req.user.id, tipe: 'dokumen', teks: `Dokumen diunggah: ${a.nama} (v${a.versi})`, meta: { attachment_id: a.id, kategori } });
    }
    await audit(db, req, 'DOKUMEN_DIUNGGAH', 'letter_in', id, { berkas: saved.map((s) => s.nama), kategori });
    return saved;
  });
  res.status(201).json(out);
}));

/* ---------- Komentar dan mention ---------- */
r.post('/:id/komentar', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const teks = str(req.body.teks, 'Komentar', { max: 2000 });
  if (is(req.user, 'viewer')) throw forbidden();
  await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'komentar', teks });
    const names = [...teks.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase());
    if (names.length) {
      const users = await db.all('SELECT id FROM users WHERE username = ANY($1) AND aktif', [names]);
      for (const u of users) {
        const target = await db.one('SELECT id,role,unit_id FROM users WHERE id=$1', [u.id]);
        const vis = visibleLettersIn(target, 'li', 1);
        if (await db.one(`SELECT 1 FROM letters_in li WHERE li.id=$1 AND ${vis.sql}`, [id, ...vis.params])) {
          await notify(db, [u.id], { tipe: 'komentar', judul: `${req.user.nama} menyebut Anda`, isi: teks.slice(0, 140), link: `/surat-masuk/${id}` }, req.user.id);
        }
      }
    }
    await audit(db, req, 'KOMENTAR', 'letter_in', id, { panjang: teks.length, no_agenda: li.no_agenda });
  });
  res.status(201).json({ ok: true });
}));

/* ---------- Konfirmasi ---------- */
r.post('/:id/konfirmasi', upload.single('bukti'), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  const d = {
    tanggal: dateStr(b.tanggal, 'Tanggal konfirmasi'),
    metode: oneOf(b.metode, METODE, 'Metode'),
    pihak: str(b.pihak, 'Pihak yang dikonfirmasi', { max: 200 }),
    hasil: str(b.hasil, 'Hasil konfirmasi', { max: 1500 }),
    catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }),
  };
  const out = await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (['SELESAI', 'DIARSIPKAN'].includes(li.status)) throw conflict('Surat sudah selesai');
    if (is(req.user, 'viewer')) throw forbidden();
    if (is(req.user, 'pelaksana')) {
      const mine = await db.one('SELECT 1 FROM tasks WHERE letter_in_id=$1 AND pic_user_id=$2', [id, req.user.id]);
      if (!mine) throw forbidden('Hanya pelaksana yang memegang tugas pada surat ini yang dapat mencatat konfirmasi');
    }
    let attId = null;
    if (req.file) attId = (await saveAttachment(db, { file: req.file, kategori: 'BUKTI', letterInId: id, userId: req.user.id })).id;
    const c = await db.one(
      `INSERT INTO confirmations(letter_in_id,tanggal,metode,pihak,hasil,catatan,bukti_attachment_id,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [id, d.tanggal, d.metode, d.pihak, d.hasil, d.catatan, attId, req.user.id],
    );
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'konfirmasi', teks: `Konfirmasi kepada ${d.pihak} melalui ${d.metode.toLowerCase()}: ${d.hasil}` });
    await audit(db, req, 'KONFIRMASI_DICATAT', 'letter_in', id, d);
    return c;
  });
  res.status(201).json(out);
}));

/* ---------- Selesaikan dan arsipkan ---------- */
r.post('/:id/selesaikan', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  if (!is(req.user, 'superadmin', 'tu', 'pimpinan', 'pejabat')) throw forbidden();
  await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (['SELESAI', 'DIARSIPKAN'].includes(li.status)) throw conflict('Surat sudah selesai');
    const s = await completionChecks(id);
    if (!s.ok) throw bad(`Syarat penyelesaian belum terpenuhi: ${s.checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}`);
    await db.q(`UPDATE letters_in SET status='SELESAI', selesai_at=now(), updated_at=now() WHERE id=$1`, [id]);
    await db.q(`UPDATE dispositions SET status='SELESAI' WHERE letter_in_id=$1 AND status IN ('BARU','DITERIMA','DITERUSKAN')`, [id]);
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'selesai', teks: 'Seluruh tindak lanjut dinyatakan selesai' });
    const people = await db.all(`SELECT DISTINCT x FROM (
        SELECT created_by AS x FROM letters_in WHERE id=$1 UNION SELECT from_user_id FROM dispositions WHERE letter_in_id=$1
        UNION SELECT to_user_id FROM dispositions WHERE letter_in_id=$1 UNION SELECT pic_user_id FROM tasks WHERE letter_in_id=$1) s WHERE x IS NOT NULL`, [id]);
    await notify(db, people.map((p) => p.x), { tipe: 'selesai', judul: 'Surat dinyatakan selesai', isi: `${li.no_agenda}: ${li.perihal}`, link: `/surat-masuk/${id}` }, req.user.id);
    await audit(db, req, 'SURAT_SELESAI', 'letter_in', id);
  });
  res.json({ ok: true });
}));

async function doArsip(req, id) {
  await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    if (li.status !== 'SELESAI') throw conflict('Hanya surat berstatus selesai yang dapat diarsipkan');
    await db.q(`UPDATE letters_in SET status='DIARSIPKAN', arsip_at=now(), updated_at=now() WHERE id=$1`, [id]);
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'arsip', teks: 'Surat diarsipkan' });
    await audit(db, req, 'SURAT_DIARSIPKAN', 'letter_in', id);
  });
}

r.post('/:id/arsipkan', requireRole('superadmin', 'tu'), wrap(async (req, res) => {
  await doArsip(req, int(req.params.id, 'ID'));
  res.json({ ok: true });
}));

/* ---------- Pelacakan publik: kelola tautan ---------- */
r.get('/:id/pelacakan', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const li = await loadLetterIn({ one, all }, req.user, id);
  if (!(canManageIn(req.user) || canDispose(req.user))) throw forbidden();
  res.json({ kode: formatTrackCode(li.track_code), url: `${base(req)}/lacak/${li.track_code}`, aktif: li.track_enabled, rahasia: li.sifat === 'Rahasia' });
}));

r.post('/:id/pelacakan', requireRole('superadmin', 'tu'), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const aksi = oneOf(req.body.aksi, ['aktifkan', 'nonaktifkan', 'buat_ulang'], 'Aksi');
  const out = await tx(async (db) => {
    const li = await loadLetterIn(db, req.user, id);
    let code = li.track_code;
    let aktif = li.track_enabled;
    if (aksi === 'buat_ulang') { code = newTrackCode(); aktif = true; } else aktif = aksi === 'aktifkan';
    await db.q('UPDATE letters_in SET track_code=$1, track_enabled=$2 WHERE id=$3', [code, aktif, id]);
    const teks = aksi === 'buat_ulang' ? 'Kode pelacakan dibuat ulang, tautan lama tidak berlaku' : aktif ? 'Pelacakan publik diaktifkan' : 'Pelacakan publik dinonaktifkan';
    await event(db, { letterInId: id, userId: req.user.id, tipe: 'pelacakan', teks });
    await audit(db, req, 'PELACAKAN_DIUBAH', 'letter_in', id, { aksi });
    return { kode: formatTrackCode(code), url: `${base(req)}/lacak/${code}`, aktif, rahasia: li.sifat === 'Rahasia' };
  });
  res.json(out);
}));

/* ---------- Lembar disposisi (data cetak) ---------- */
r.get('/:id/lembar-disposisi', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const li = await loadLetterIn({ one, all }, req.user, id);
  if (!(canManageIn(req.user) || canDispose(req.user) || is(req.user, 'pejabat'))) throw forbidden();
  const disp = await all(
    `SELECT d.id,d.parent_id,d.tindakan,d.instruksi,d.deadline,d.prioritas,d.status,d.created_at,fu.nama AS dari,fu.jabatan AS dari_jabatan,
            COALESCE(tu.nama, un.nama) AS kepada, tu.jabatan AS kepada_jabatan
       FROM dispositions d JOIN users fu ON fu.id=d.from_user_id LEFT JOIN users tu ON tu.id=d.to_user_id LEFT JOIN units un ON un.id=d.to_unit_id
      WHERE d.letter_in_id=$1 ORDER BY d.id`, [id],
  );
  const url = `${base(req)}/s/${li.qr_token}`;
  const inst = (await one(`SELECT value FROM settings WHERE key='instansi'`))?.value || {};
  res.json({ letter: li, dispositions: disp, instansi: inst, qr: await QRCode.toDataURL(url, { margin: 1, width: 180 }) });
}));

export default r;
