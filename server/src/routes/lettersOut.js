import { Router } from 'express';
import fs from 'node:fs/promises';
import { one, all, tx } from '../db.js';
import { wrap, str, oneOf, int, dateStr, bad, forbidden, notFound, conflict, today, ROMAWI } from '../util.js';
import { audit, event, notify, nextSeq, getSetting } from '../record.js';
import { upload, absPath } from '../storage.js';
import { saveAttachment, ATT_SELECT } from '../attachments.js';
import { visibleLettersOut, canWriteOut, canApprove, canReview, is } from '../perm.js';
import { loadLetterIn, recomputeStatus } from '../cases.js';
import { renderDocx, formatValues, docxToHtml, docxToPdf } from '../docx.js';
import { withBawaan } from './templates.js';
import { pageParams, csvList, sendCsv, runBulk } from '../listing.js';

const r = Router();
export const STATUS_OUT = {
  DRAFT: 'Draft', REVIEW: 'Review', REVISI: 'Revisi', MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan', DISETUJUI: 'Disetujui',
  NOMOR_DIBERIKAN: 'Nomor diberikan', DITANDATANGANI: 'Ditandatangani', DIKIRIM: 'Dikirim', SELESAI: 'Selesai', DITOLAK: 'Ditolak',
};
const METODE_KIRIM = ['Surat resmi', 'Email', 'WhatsApp', 'Tatap muka', 'Sistem/aplikasi', 'Lainnya'];
const PLACEHOLDER_NOMOR = '[nomor diberikan setelah disetujui]';

async function loadOut(db, user, id) {
  const vis = visibleLettersOut(user, 'lo', 1);
  const lo = await db.one(`SELECT lo.* FROM letters_out lo WHERE lo.id=$1 AND ${vis.sql}`, [id, ...vis.params]);
  if (!lo) {
    const ex = await db.one('SELECT 1 FROM letters_out WHERE id=$1', [id]);
    throw ex ? forbidden('Anda tidak memiliki akses ke surat ini') : notFound('Surat keluar tidak ditemukan');
  }
  return lo;
}

const canEdit = (user, lo) =>
  (['DRAFT', 'REVISI'].includes(lo.status) && (lo.created_by === user.id || is(user, 'superadmin', 'tu'))) ||
  (lo.status === 'REVIEW' && canReview(user));

/** Susun nilai placeholder: field isian, kolom bawaan, dan field sistem. */
async function buildValues(db, lo, tv) {
  const inst = (await getSetting(db, 'instansi', {})) || {};
  const signer = lo.penandatangan_id ? await db.one('SELECT nama,jabatan,nip,pangkat FROM users WHERE id=$1', [lo.penandatangan_id]) : null;
  const raw = {
    ...lo.fields,
    perihal: lo.perihal, hal: lo.perihal, nama_penerima: lo.tujuan, kepada: lo.tujuan,
    tanggal: lo.tgl_surat,
    nomor_surat: lo.nomor_surat || PLACEHOLDER_NOMOR, nomor: lo.nomor_surat || PLACEHOLDER_NOMOR,
    kop_instansi: inst.nama || '', kop_alamat: inst.alamat || '', kota: inst.kota || '',
    penandatangan: signer?.nama || '', penandatangan_nama: signer?.nama || '', penandatangan_jabatan: signer?.jabatan || '',
    penandatangan_nip: signer?.nip || '', penandatangan_pangkat: signer?.pangkat || '',
  };
  return formatValues(tv.fields, raw);
}

async function renderOut(db, lo) {
  const tv = await db.one('SELECT * FROM template_versions WHERE id=$1', [lo.template_version_id]);
  const buf = await fs.readFile(absPath(tv.file_path));
  return renderDocx(buf, await buildValues(db, lo, tv));
}

/** Hasilkan DOCX terbaru dan simpan sebagai versi dokumen baru. */
async function storeDoc(db, lo, userId, kategori) {
  const buffer = await renderOut(db, lo);
  const a = await saveAttachment(db, {
    buffer, ext: 'docx', kategori, letterOutId: lo.id, userId,
    nama: `${lo.no_agenda}${kategori === 'FINAL' ? '-final' : ''}.docx`,
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  await db.q('UPDATE letters_out SET doc_version=$1, updated_at=now() WHERE id=$2', [a.versi, lo.id]);
  return a;
}

function cleanFields(tv, input) {
  const out = {};
  for (const f of tv.fields) {
    if (f.sistem || ['perihal', 'hal', 'nama_penerima', 'kepada', 'tanggal'].includes(f.name)) continue;
    const v = input?.[f.name];
    out[f.name] = v == null ? '' : String(v).slice(0, 4000);
    if (f.type === 'date' && out[f.name]) dateStr(out[f.name], f.label);
  }
  return out;
}

function missingRequired(tv, lo) {
  return tv.fields.filter((f) => f.required && !f.sistem && !['perihal', 'hal', 'nama_penerima', 'kepada', 'tanggal'].includes(f.name) && !String(lo.fields[f.name] ?? '').trim()).map((f) => f.label);
}

/* ---------- Daftar ---------- */
const SORTS = { dibuat: 'lo.id', tgl: 'lo.tgl_surat', perihal: 'lo.perihal', tujuan: 'lo.tujuan', status: 'lo.status', nomor: 'lo.nomor_surat', agenda: 'lo.id' };

function outFilter(req) {
  const vis = visibleLettersOut(req.user, 'lo', 0);
  const params = [...vis.params];
  const where = [vis.sql];
  const add = (cond, val) => { params.push(val); where.push(cond.replace(/\?/g, `$${params.length}`)); };
  const st = csvList(req.query.status);
  if (st.length) add('lo.status = ANY(?)', st);
  if (req.query.mine === '1') add('lo.created_by=?', req.user.id);
  if (req.query.jenis) add('lo.jenis = ?', String(req.query.jenis));
  if (req.query.from) add('lo.tgl_surat >= ?', dateStr(req.query.from, 'Dari tanggal'));
  if (req.query.to) add('lo.tgl_surat <= ?', dateStr(req.query.to, 'Sampai tanggal'));
  if (req.query.antrian === 'menunggu_saya') {
    if (canApprove(req.user)) where.push(`lo.status='MENUNGGU_PERSETUJUAN'`);
    else if (canReview(req.user)) where.push(`lo.status='REVIEW'`);
    else where.push('FALSE');
  }
  if (req.query.q) add(`(lo.no_agenda ILIKE ? OR lo.nomor_surat ILIKE ? OR lo.perihal ILIKE ? OR lo.tujuan ILIKE ?)`, `%${String(req.query.q).slice(0, 100)}%`);
  return { sql: where.join(' AND '), params };
}
const OFROM = `FROM letters_out lo JOIN users u ON u.id=lo.created_by LEFT JOIN letters_in li ON li.id=lo.letter_in_id`;

r.get('/', wrap(async (req, res) => {
  const w = outFilter(req);
  const pg = pageParams(req.query, { sorts: SORTS, defaultSort: 'dibuat' });
  const cols = `lo.id,lo.no_agenda,lo.nomor_surat,lo.jenis,lo.perihal,lo.tujuan,lo.status,lo.tgl_surat,lo.created_at,lo.letter_in_id,u.nama AS pembuat,li.no_agenda AS asal_agenda`;
  if (req.query.format === 'csv') {
    const rows = await all(`SELECT ${cols} ${OFROM} WHERE ${w.sql} ORDER BY ${pg.orderBy} LIMIT 5000`, w.params);
    return sendCsv(res, `surat-keluar-${today()}.csv`, ['No. Agenda', 'Nomor surat', 'Tanggal', 'Jenis', 'Tujuan', 'Perihal', 'Pembuat', 'Status'],
      rows.map((x) => [x.no_agenda, x.nomor_surat, x.tgl_surat, x.jenis, x.tujuan, x.perihal, x.pembuat, STATUS_OUT[x.status]]));
  }
  const rows = await all(`SELECT ${cols} ${OFROM} WHERE ${w.sql} ORDER BY ${pg.orderBy}, lo.id DESC LIMIT ${pg.limit} OFFSET ${pg.offset}`, w.params);
  const total = (await one(`SELECT count(*) AS n ${OFROM} WHERE ${w.sql}`, w.params)).n;
  res.json({ items: rows.map((x) => ({ ...x, statusLabel: STATUS_OUT[x.status] })), total, page: pg.page, pageSize: pg.pageSize });
}));

r.get('/ids', wrap(async (req, res) => {
  const w = outFilter(req);
  const total = (await one(`SELECT count(*) AS n ${OFROM} WHERE ${w.sql}`, w.params)).n;
  const ids = (await all(`SELECT lo.id ${OFROM} WHERE ${w.sql} ORDER BY lo.id DESC LIMIT 500`, w.params)).map((x) => x.id);
  res.json({ ids, total, terpotong: total > ids.length });
}));

/* ---------- Pratinjau tanpa menyimpan ---------- */
r.post('/pratinjau', wrap(async (req, res) => {
  if (!canWriteOut(req.user)) throw forbidden();
  const tv = await one('SELECT * FROM template_versions WHERE id=$1', [int(req.body.template_version_id, 'Template')]);
  if (!tv) throw notFound('Template tidak ditemukan');
  const lo = {
    fields: cleanFields(tv, req.body.fields), perihal: String(req.body.perihal || '').slice(0, 500), tujuan: String(req.body.tujuan || '').slice(0, 500),
    tgl_surat: req.body.tgl_surat || today(), nomor_surat: null, penandatangan_id: int(req.body.penandatangan_id, 'Penandatangan', { required: false }),
  };
  const buf = await fs.readFile(absPath(tv.file_path));
  res.json({ html: await docxToHtml(renderDocx(buf, await buildValues({ one }, lo, tv))) });
}));

/* ---------- Buat ---------- */
r.post('/', wrap(async (req, res) => {
  if (!canWriteOut(req.user)) throw forbidden('Peran Anda tidak dapat membuat surat keluar');
  const b = req.body;
  const out = await tx(async (db) => {
    const tv = await db.one(
      `SELECT v.*, t.jenis, t.aktif AS t_aktif FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1`, [int(b.template_version_id, 'Template')],
    );
    if (!tv || !tv.t_aktif) throw bad('Template tidak tersedia');
    const letterInId = int(b.letter_in_id, 'Surat masuk', { required: false });
    if (letterInId) await loadLetterIn(db, req.user, letterInId);
    const perihal = str(b.perihal, 'Perihal', { max: 500 });
    const tujuan = str(b.tujuan, 'Tujuan', { max: 500 });
    const tgl = dateStr(b.tgl_surat, 'Tanggal surat');
    const signer = int(b.penandatangan_id, 'Penandatangan', { required: false });
    if (signer && !(await db.one(`SELECT 1 FROM users WHERE id=$1 AND aktif AND role IN ('pimpinan','pejabat','superadmin')`, [signer]))) throw bad('Penandatangan tidak valid');
    const year = tgl.slice(0, 4);
    const seq = await nextSeq(db, `SK-${year}`);
    const no_agenda = `SK-${year}-${String(seq).padStart(6, '0')}`;
    const lo = await db.one(
      `INSERT INTO letters_out(no_agenda,letter_in_id,template_version_id,jenis,perihal,tujuan,fields,tgl_surat,penandatangan_id,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [no_agenda, letterInId, tv.id, tv.jenis, perihal, tujuan, JSON.stringify(cleanFields(tv, b.fields)), tgl, signer, req.user.id],
    );
    await storeDoc(db, lo, req.user.id, 'DRAF');
    await event(db, { letterInId, letterOutId: lo.id, userId: req.user.id, tipe: 'surat_keluar', teks: `Draft ${tv.jenis} dibuat (${no_agenda})` });
    if (letterInId) await recomputeStatus(db, letterInId);
    await audit(db, req, 'SURAT_KELUAR_DIBUAT', 'letter_out', lo.id, { no_agenda, jenis: tv.jenis, letter_in: letterInId });
    return { id: lo.id, no_agenda };
  });
  res.status(201).json(out);
}));

/* ---------- Detail ---------- */
r.get('/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const lo = await loadOut({ one, all }, req.user, id);
  const tv = await one(`SELECT v.id,v.versi,v.fields,t.nama AS template_nama,t.id AS template_id FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1`, [lo.template_version_id]);
  const creator = await one('SELECT nama FROM users WHERE id=$1', [lo.created_by]);
  const signer = lo.penandatangan_id ? await one('SELECT id,nama,jabatan FROM users WHERE id=$1', [lo.penandatangan_id]) : null;
  const approvals = await all('SELECT a.*, u.nama AS user_nama FROM approvals a JOIN users u ON u.id=a.user_id WHERE a.letter_out_id=$1 ORDER BY a.id', [id]);
  const attachments = req.user.role === 'viewer' && !['DIKIRIM', 'SELESAI'].includes(lo.status) ? [] : await all(`${ATT_SELECT} WHERE a.letter_out_id=$1 ORDER BY a.created_at`, [id]);
  const asal = lo.letter_in_id ? await one('SELECT id,no_agenda,perihal,asal FROM letters_in WHERE id=$1', [lo.letter_in_id]).catch(() => null) : null;
  const editable = canEdit(req.user, lo);
  const owner = lo.created_by === req.user.id || is(req.user, 'superadmin', 'tu');
  const can = {
    edit: editable,
    ajukanReview: ['DRAFT', 'REVISI'].includes(lo.status) && owner,
    ajukan: (['DRAFT', 'REVISI'].includes(lo.status) && owner) || (lo.status === 'REVIEW' && canReview(req.user)),
    review: lo.status === 'REVIEW' && canReview(req.user),
    putuskan: lo.status === 'MENUNGGU_PERSETUJUAN' && canApprove(req.user),
    ttd: lo.status === 'NOMOR_DIBERIKAN' && (is(req.user, 'superadmin', 'tu') || lo.created_by === req.user.id),
    kirim: lo.status === 'DITANDATANGANI' && is(req.user, 'superadmin', 'tu'),
    selesai: lo.status === 'DIKIRIM' && is(req.user, 'superadmin', 'tu'),
    komentar: !is(req.user, 'viewer'),
    unggah: !is(req.user, 'viewer') && !['SELESAI', 'DITOLAK'].includes(lo.status),
  };
  res.json({
    letter: { ...lo, statusLabel: STATUS_OUT[lo.status], pembuat: creator?.nama },
    template: { id: tv.template_id, nama: tv.template_nama, versi: tv.versi, fields: withBawaan(tv.fields) },
    signer, approvals, attachments, asal, can, kurang: missingRequired(tv, lo),
  });
}));

r.get('/:id/timeline', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  await loadOut({ one, all }, req.user, id);
  res.json(await all(`SELECT e.id,e.tipe,e.teks,e.meta,e.created_at,u.nama AS user_nama FROM events e LEFT JOIN users u ON u.id=e.user_id WHERE e.letter_out_id=$1 ORDER BY e.created_at,e.id`, [id]));
}));

r.get('/:id/pratinjau', wrap(async (req, res) => {
  const lo = await loadOut({ one, all }, req.user, int(req.params.id, 'ID'));
  res.json({ html: await docxToHtml(await renderOut({ one }, lo)) });
}));

r.get('/:id/unduh', wrap(async (req, res) => {
  const lo = await loadOut({ one, all }, req.user, int(req.params.id, 'ID'));
  const format = oneOf(req.query.format || 'docx', ['docx', 'pdf'], 'Format');
  if (req.user.role === 'viewer' && !['DIKIRIM', 'SELESAI'].includes(lo.status)) throw forbidden();
  let buf = await renderOut({ one }, lo);
  const base = (lo.nomor_surat || lo.no_agenda).replace(/[^A-Za-z0-9._-]+/g, '_');
  if (format === 'pdf') buf = await docxToPdf(buf);
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${base}.${format}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  await audit(null, req, 'SURAT_KELUAR_DIUNDUH', 'letter_out', lo.id, { format });
  res.send(buf);
}));

/* ---------- Ubah isi ---------- */
r.put('/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  await tx(async (db) => {
    const lo = await loadOut(db, req.user, id);
    if (!canEdit(req.user, lo)) throw forbidden('Surat tidak dapat diubah pada status ini');
    const tv = await db.one('SELECT * FROM template_versions WHERE id=$1', [lo.template_version_id]);
    const signer = int(b.penandatangan_id, 'Penandatangan', { required: false });
    const next = {
      ...lo,
      perihal: str(b.perihal, 'Perihal', { max: 500 }),
      tujuan: str(b.tujuan, 'Tujuan', { max: 500 }),
      tgl_surat: dateStr(b.tgl_surat, 'Tanggal surat'),
      penandatangan_id: signer,
      fields: cleanFields(tv, b.fields),
    };
    await db.q('UPDATE letters_out SET perihal=$1,tujuan=$2,tgl_surat=$3,penandatangan_id=$4,fields=$5,updated_at=now() WHERE id=$6',
      [next.perihal, next.tujuan, next.tgl_surat, signer, JSON.stringify(next.fields), id]);
    const a = await storeDoc(db, next, req.user.id, 'DRAF');
    await event(db, { letterInId: lo.letter_in_id, letterOutId: id, userId: req.user.id, tipe: 'revisi_dokumen', teks: `Dokumen diperbarui menjadi v${a.versi}` });
    await audit(db, req, 'SURAT_KELUAR_DIUBAH', 'letter_out', id, { versi: a.versi });
  });
  res.json({ ok: true });
}));

/* ---------- Alur persetujuan ---------- */
async function step(db, req, lo, { status, aksi, catatan, teks, notifyIds = [], notifJudul }) {
  await db.q('UPDATE letters_out SET status=$1, updated_at=now() WHERE id=$2', [status, lo.id]);
  await db.q('INSERT INTO approvals(letter_out_id,user_id,aksi,catatan) VALUES($1,$2,$3,$4)', [lo.id, req.user.id, aksi, catatan]);
  await event(db, { letterInId: lo.letter_in_id, letterOutId: lo.id, userId: req.user.id, tipe: 'approval', teks: catatan ? `${teks}. Catatan: ${catatan}` : teks });
  if (notifJudul) await notify(db, notifyIds, { tipe: 'approval', judul: notifJudul, isi: `${lo.no_agenda}: ${lo.perihal}`, link: `/surat-keluar/${lo.id}` }, req.user.id);
  if (lo.letter_in_id) await recomputeStatus(db, lo.letter_in_id);
  await audit(db, req, `SURAT_KELUAR_${aksi}`, 'letter_out', lo.id, { status, catatan });
}
const approverIds = async (db) => (await db.all(`SELECT id FROM users WHERE role='pimpinan' AND aktif`)).map((u) => u.id);

async function lockOut(db, user, id) {
  await loadOut(db, user, id);
  return db.one('SELECT * FROM letters_out WHERE id=$1 FOR UPDATE', [id]);
}

r.post('/:id/ajukan-review', wrap(async (req, res) => {
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, int(req.params.id, 'ID'));
    if (!['DRAFT', 'REVISI'].includes(lo.status)) throw conflict('Surat tidak dalam status draft atau revisi');
    if (!(lo.created_by === req.user.id || is(req.user, 'superadmin', 'tu'))) throw forbidden();
    const reviewers = (await db.all(`SELECT id FROM users WHERE role IN ('pejabat','pimpinan') AND aktif`)).map((u) => u.id);
    await step(db, req, lo, { status: 'REVIEW', aksi: 'AJUKAN_REVIEW', catatan: str(req.body.catatan, 'Catatan', { max: 1000, required: false }), teks: 'Diajukan untuk review', notifyIds: reviewers, notifJudul: 'Surat keluar menunggu review' });
  });
  res.json({ ok: true });
}));

r.post('/:id/review', wrap(async (req, res) => {
  const aksi = oneOf(req.body.aksi, ['lanjut', 'revisi'], 'Keputusan review');
  const catatan = str(req.body.catatan, 'Catatan', { max: 1000, required: aksi === 'revisi' });
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, int(req.params.id, 'ID'));
    if (lo.status !== 'REVIEW') throw conflict('Surat tidak sedang direview');
    if (!canReview(req.user)) throw forbidden();
    if (aksi === 'lanjut') await step(db, req, lo, { status: 'MENUNGGU_PERSETUJUAN', aksi: 'REVIEW_LANJUT', catatan, teks: 'Review selesai, diajukan untuk persetujuan', notifyIds: await approverIds(db), notifJudul: 'Surat keluar menunggu persetujuan Anda' });
    else await step(db, req, lo, { status: 'REVISI', aksi: 'REVIEW_REVISI', catatan, teks: 'Dikembalikan untuk revisi', notifyIds: [lo.created_by], notifJudul: 'Surat keluar perlu direvisi' });
  });
  res.json({ ok: true });
}));

r.post('/bulk/ajukan', wrap(async (req, res) => {
  res.json(await runBulk(req.body.ids, (id) => doAjukan(req, id, {})));
}));
r.post('/bulk/keputusan', wrap(async (req, res) => {
  res.json(await runBulk(req.body.ids, (id) => doKeputusan(req, id, req.body)));
}));

async function doAjukan(req, id, b = {}) {
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, id);
    if (!['DRAFT', 'REVISI', 'REVIEW'].includes(lo.status)) throw conflict('Surat tidak dapat diajukan pada status ini');
    const owner = lo.created_by === req.user.id || is(req.user, 'superadmin', 'tu');
    if (lo.status === 'REVIEW' ? !canReview(req.user) : !owner) throw forbidden();
    const tv = await db.one('SELECT * FROM template_versions WHERE id=$1', [lo.template_version_id]);
    const kurang = missingRequired(tv, lo);
    if (kurang.length) throw bad(`Lengkapi isian berikut sebelum diajukan: ${kurang.join(', ')}`);
    if (!lo.penandatangan_id) throw bad('Pilih penandatangan sebelum diajukan');
    await step(db, req, lo, { status: 'MENUNGGU_PERSETUJUAN', aksi: 'AJUKAN', catatan: str(b.catatan, 'Catatan', { max: 1000, required: false }), teks: 'Diajukan untuk persetujuan', notifyIds: await approverIds(db), notifJudul: 'Surat keluar menunggu persetujuan Anda' });
  });
}

r.post('/:id/ajukan', wrap(async (req, res) => {
  await doAjukan(req, int(req.params.id, 'ID'), req.body);
  res.json({ ok: true });
}));

/** Penomoran otomatis. Urutan atomik per tahun, nomor unik di tingkat database. */
async function assignNomor(db, lo) {
  const tpl = await db.one('SELECT t.kode_klasifikasi FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1', [lo.template_version_id]);
  const cfg = await getSetting(db, 'penomoran', { format: '{kode}/{urut}/{unit}/{bulan_romawi}/{tahun}', kode_default: '000', digits: 3 });
  const inst = (await getSetting(db, 'instansi', {})) || {};
  const year = lo.tgl_surat.slice(0, 4);
  const month = Number(lo.tgl_surat.slice(5, 7));
  const urut = await nextSeq(db, `NO-${year}`);
  return cfg.format
    .replaceAll('{kode}', tpl.kode_klasifikasi || cfg.kode_default)
    .replaceAll('{urut}', String(urut).padStart(cfg.digits, '0'))
    .replaceAll('{unit}', inst.kode_unit || '')
    .replaceAll('{bulan_romawi}', ROMAWI[month - 1])
    .replaceAll('{bulan}', String(month).padStart(2, '0'))
    .replaceAll('{tahun}', year);
}

async function doKeputusan(req, id, b) {
  const aksi = oneOf(b.aksi, ['setuju', 'tolak', 'revisi'], 'Keputusan');
  const catatan = str(b.catatan, 'Catatan', { max: 1000, required: aksi !== 'setuju' });
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, id);
    if (lo.status !== 'MENUNGGU_PERSETUJUAN') throw conflict('Surat tidak sedang menunggu persetujuan');
    if (!canApprove(req.user)) throw forbidden('Hanya pimpinan yang dapat memutuskan persetujuan');
    if (aksi === 'tolak') {
      await step(db, req, lo, { status: 'DITOLAK', aksi: 'TOLAK', catatan, teks: 'Surat ditolak', notifyIds: [lo.created_by], notifJudul: 'Surat keluar ditolak' });
    } else if (aksi === 'revisi') {
      await step(db, req, lo, { status: 'REVISI', aksi: 'REVISI', catatan, teks: 'Dikembalikan untuk diperbaiki', notifyIds: [lo.created_by], notifJudul: 'Surat keluar perlu diperbaiki' });
    } else {
      const nomor = await assignNomor(db, lo);
      await db.q('UPDATE letters_out SET nomor_surat=$1 WHERE id=$2', [nomor, lo.id]);
      const withNo = { ...lo, nomor_surat: nomor };
      await storeDoc(db, withNo, req.user.id, 'FINAL');
      await step(db, req, withNo, { status: 'NOMOR_DIBERIKAN', aksi: 'SETUJU', catatan, teks: `Disetujui, nomor surat ${nomor} diberikan`, notifyIds: [lo.created_by, ...(await db.all(`SELECT id FROM users WHERE role='tu' AND aktif`)).map((u) => u.id)], notifJudul: 'Surat keluar disetujui' });
    }
  });
}

r.post('/:id/keputusan', wrap(async (req, res) => {
  await doKeputusan(req, int(req.params.id, 'ID'), req.body);
  res.json({ ok: true });
}));

r.post('/:id/ttd', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw bad('Unggah dokumen yang sudah ditandatangani (PDF)');
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, int(req.params.id, 'ID'));
    if (lo.status !== 'NOMOR_DIBERIKAN') throw conflict('Surat belum bernomor atau sudah ditandatangani');
    if (!(is(req.user, 'superadmin', 'tu') || lo.created_by === req.user.id)) throw forbidden();
    if (!req.file.originalname.toLowerCase().endsWith('.pdf')) throw bad('Dokumen bertanda tangan harus berformat PDF');
    const a = await saveAttachment(db, { file: req.file, kategori: 'TTD', letterOutId: lo.id, userId: req.user.id, nama: `${lo.no_agenda}-ttd.pdf` });
    await step(db, req, lo, { status: 'DITANDATANGANI', aksi: 'TTD', catatan: null, teks: `Dokumen bertanda tangan diunggah (v${a.versi})` });
  });
  res.json({ ok: true });
}));

r.post('/:id/kirim', wrap(async (req, res) => {
  const metode = oneOf(req.body.metode, METODE_KIRIM, 'Metode pengiriman');
  const catatan = str(req.body.catatan, 'Catatan', { max: 500, required: false });
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, int(req.params.id, 'ID'));
    if (lo.status !== 'DITANDATANGANI') throw conflict('Surat harus ditandatangani sebelum dikirim');
    if (!is(req.user, 'superadmin', 'tu')) throw forbidden();
    await db.q('UPDATE letters_out SET sent_at=now(), sent_method=$1 WHERE id=$2', [metode, lo.id]);
    await step(db, req, lo, { status: 'DIKIRIM', aksi: 'KIRIM', catatan, teks: `Surat dikirim melalui ${metode.toLowerCase()} kepada ${lo.tujuan}` });
  });
  res.json({ ok: true });
}));

r.post('/:id/selesai', wrap(async (req, res) => {
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, int(req.params.id, 'ID'));
    if (lo.status !== 'DIKIRIM') throw conflict('Surat belum dikirim');
    if (!is(req.user, 'superadmin', 'tu')) throw forbidden();
    await step(db, req, lo, { status: 'SELESAI', aksi: 'SELESAI', catatan: null, teks: 'Surat keluar selesai' });
  });
  res.json({ ok: true });
}));

/* ---------- Dokumen dan komentar ---------- */
r.post('/:id/lampiran', upload.array('files', 10), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  if (!req.files?.length) throw bad('Pilih file yang akan diunggah');
  await tx(async (db) => {
    const lo = await lockOut(db, req.user, id);
    if (is(req.user, 'viewer')) throw forbidden();
    if (['SELESAI', 'DITOLAK'].includes(lo.status)) throw conflict('Surat sudah ditutup');
    for (const f of req.files) {
      const a = await saveAttachment(db, { file: f, kategori: 'PENDUKUNG', letterOutId: id, userId: req.user.id });
      await event(db, { letterInId: lo.letter_in_id, letterOutId: id, userId: req.user.id, tipe: 'dokumen', teks: `Dokumen diunggah: ${a.nama} (v${a.versi})` });
    }
    await audit(db, req, 'DOKUMEN_DIUNGGAH', 'letter_out', id, { berkas: req.files.map((f) => f.originalname) });
  });
  res.status(201).json({ ok: true });
}));

r.post('/:id/komentar', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const teks = str(req.body.teks, 'Komentar', { max: 2000 });
  if (is(req.user, 'viewer')) throw forbidden();
  await tx(async (db) => {
    const lo = await loadOut(db, req.user, id);
    await event(db, { letterInId: lo.letter_in_id, letterOutId: id, userId: req.user.id, tipe: 'komentar', teks });
    const names = [...teks.matchAll(/@([a-z0-9._-]+)/gi)].map((m) => m[1].toLowerCase());
    if (names.length) {
      const users = await db.all('SELECT id,role,unit_id FROM users WHERE username = ANY($1) AND aktif', [names]);
      for (const u of users) {
        const vis = visibleLettersOut(u, 'lo', 1);
        if (await db.one(`SELECT 1 FROM letters_out lo WHERE lo.id=$1 AND ${vis.sql}`, [id, ...vis.params])) {
          await notify(db, [u.id], { tipe: 'komentar', judul: `${req.user.nama} menyebut Anda`, isi: teks.slice(0, 140), link: `/surat-keluar/${id}` }, req.user.id);
        }
      }
    }
    await audit(db, req, 'KOMENTAR', 'letter_out', id, { panjang: teks.length });
  });
  res.status(201).json({ ok: true });
}));

export default r;
