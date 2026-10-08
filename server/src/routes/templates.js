import { Router } from 'express';
import fs from 'node:fs/promises';
import { one, all, tx } from '../db.js';
import { wrap, str, oneOf, int, bad, notFound } from '../util.js';
import { audit } from '../record.js';
import { upload, saveBuffer, absPath, validateFile } from '../storage.js';
import { extractFields, renderDocx, docxToHtml } from '../docx.js';
import { requireRole } from '../perm.js';

const r = Router();
const admin = requireRole('superadmin');

/** Field yang diisi dari kolom bawaan formulir surat keluar, bukan dari daftar field dinamis. */
export const BAWAAN = new Set(['perihal', 'hal', 'nama_penerima', 'kepada', 'tanggal']);
export const withBawaan = (fields) => fields.map((f) => ({ ...f, bawaan: BAWAAN.has(f.name) }));

r.get('/', wrap(async (req, res) => {
  const onlyActive = req.user.role !== 'superadmin';
  const rows = await all(
    `SELECT t.id,t.nama,t.kode,t.jenis,t.deskripsi,t.kode_klasifikasi,t.aktif,t.created_at, u.nama AS dibuat_oleh,
            (SELECT count(*) FROM template_versions v WHERE v.template_id=t.id) AS jumlah_versi,
            (SELECT v.id FROM template_versions v WHERE v.template_id=t.id AND v.aktif LIMIT 1) AS versi_aktif_id,
            (SELECT v.versi FROM template_versions v WHERE v.template_id=t.id AND v.aktif LIMIT 1) AS versi_aktif
       FROM templates t LEFT JOIN users u ON u.id=t.created_by ${onlyActive ? 'WHERE t.aktif' : ''} ORDER BY t.nama`,
  );
  res.json(onlyActive ? rows.filter((x) => x.versi_aktif_id) : rows);
}));

r.get('/:id', wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const t = await one('SELECT * FROM templates WHERE id=$1', [id]);
  if (!t || (!t.aktif && req.user.role !== 'superadmin')) throw notFound('Template tidak ditemukan');
  const versions = await all(
    `SELECT v.id,v.versi,v.catatan,v.fields,v.aktif,v.created_at,u.nama AS dibuat_oleh FROM template_versions v LEFT JOIN users u ON u.id=v.created_by
      WHERE v.template_id=$1 ${req.user.role === 'superadmin' ? '' : 'AND v.aktif'} ORDER BY v.versi DESC`, [id],
  );
  res.json({ template: t, versions: versions.map((v) => ({ ...v, fields: withBawaan(v.fields) })) });
}));

async function createVersion(db, req, templateId, file, catatan, activate) {
  validateFile(file);
  if (!file.originalname.toLowerCase().endsWith('.docx')) throw bad('Template harus berformat DOCX');
  const fields = extractFields(file.buffer);
  if (fields.length === 0) throw bad('Tidak ada placeholder ditemukan. Tulis field dengan format {{nama_field}} di dalam dokumen');
  const next = (await db.one('SELECT COALESCE(max(versi),0)+1 AS v FROM template_versions WHERE template_id=$1', [templateId])).v;
  const rel = await saveBuffer(file.buffer, 'docx');
  if (activate) await db.q('UPDATE template_versions SET aktif=FALSE WHERE template_id=$1', [templateId]);
  const v = await db.one(
    `INSERT INTO template_versions(template_id,versi,catatan,file_path,fields,aktif,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,versi`,
    [templateId, next, catatan, rel, JSON.stringify(fields), activate, req.user.id],
  );
  return { ...v, fields };
}

r.post('/', admin, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw bad('Unggah file template DOCX');
  const b = req.body;
  const nama = str(b.nama, 'Nama template', { max: 120 });
  const jenis = str(b.jenis, 'Jenis surat', { max: 80 });
  const kode = str(b.kode, 'Kode template', { max: 40 }).toLowerCase();
  if (!/^[a-z0-9-]+$/.test(kode)) throw bad('Kode template hanya boleh huruf kecil, angka, dan strip');
  const out = await tx(async (db) => {
    if (await db.one('SELECT 1 FROM templates WHERE kode=$1', [kode])) throw bad('Kode template sudah dipakai');
    const t = await db.one(
      `INSERT INTO templates(nama,kode,jenis,deskripsi,kode_klasifikasi,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [nama, kode, jenis, str(b.deskripsi, 'Deskripsi', { max: 400, required: false }), str(b.kode_klasifikasi, 'Kode klasifikasi', { max: 20, required: false }), req.user.id],
    );
    const v = await createVersion(db, req, t.id, req.file, 'Versi awal', true);
    await audit(db, req, 'TEMPLATE_DIBUAT', 'template', t.id, { nama, kode, field: v.fields.length });
    return { id: t.id, versi: v.versi };
  });
  res.status(201).json(out);
}));

r.put('/:id', admin, wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const b = req.body;
  const t = await one(
    `UPDATE templates SET nama=$1, jenis=$2, deskripsi=$3, kode_klasifikasi=$4, aktif=$5 WHERE id=$6 RETURNING id`,
    [str(b.nama, 'Nama template', { max: 120 }), str(b.jenis, 'Jenis surat', { max: 80 }), str(b.deskripsi, 'Deskripsi', { max: 400, required: false }), str(b.kode_klasifikasi, 'Kode klasifikasi', { max: 20, required: false }), b.aktif !== false, id],
  );
  if (!t) throw notFound();
  await audit(null, req, 'TEMPLATE_DIUBAH', 'template', id, { aktif: b.aktif !== false });
  res.json({ ok: true });
}));

r.post('/:id/versi', admin, upload.single('file'), wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  if (!req.file) throw bad('Unggah file template DOCX');
  const out = await tx(async (db) => {
    if (!(await db.one('SELECT 1 FROM templates WHERE id=$1', [id]))) throw notFound();
    const v = await createVersion(db, req, id, req.file, str(req.body.catatan, 'Catatan versi', { max: 300, required: false }), req.body.aktifkan !== 'false');
    await audit(db, req, 'TEMPLATE_VERSI_BARU', 'template', id, { versi: v.versi });
    return { id: v.id, versi: v.versi };
  });
  res.status(201).json(out);
}));

r.post('/:id/versi/:vid/aktifkan', admin, wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const vid = int(req.params.vid, 'Versi');
  await tx(async (db) => {
    const v = await db.one('SELECT versi FROM template_versions WHERE id=$1 AND template_id=$2', [vid, id]);
    if (!v) throw notFound();
    await db.q('UPDATE template_versions SET aktif=FALSE WHERE template_id=$1', [id]);
    await db.q('UPDATE template_versions SET aktif=TRUE WHERE id=$1', [vid]);
    await audit(db, req, 'TEMPLATE_VERSI_AKTIF', 'template', id, { versi: v.versi });
  });
  res.json({ ok: true });
}));

/** Ubah label, tipe, dan wajib-isi field. Nama field tidak dapat diubah karena terikat ke dokumen. */
r.put('/:id/versi/:vid/field', admin, wrap(async (req, res) => {
  const id = int(req.params.id, 'ID');
  const vid = int(req.params.vid, 'Versi');
  const v = await one('SELECT fields FROM template_versions WHERE id=$1 AND template_id=$2', [vid, id]);
  if (!v) throw notFound();
  const incoming = Array.isArray(req.body.fields) ? req.body.fields : [];
  const fields = v.fields.map((f) => {
    const n = incoming.find((x) => x.name === f.name);
    if (!n || f.sistem) return f;
    return { ...f, label: str(n.label, `Label ${f.name}`, { max: 80 }), type: oneOf(n.type, ['text', 'textarea', 'date'], 'Tipe'), required: Boolean(n.required) };
  });
  await one('UPDATE template_versions SET fields=$1 WHERE id=$2 RETURNING id', [JSON.stringify(fields), vid]);
  await audit(null, req, 'TEMPLATE_FIELD_DIUBAH', 'template', id, { versi_id: vid });
  res.json({ ok: true });
}));

r.get('/:id/versi/:vid/unduh', admin, wrap(async (req, res) => {
  const v = await one('SELECT v.file_path,t.kode,v.versi FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1 AND v.template_id=$2', [int(req.params.vid, 'Versi'), int(req.params.id, 'ID')]);
  if (!v) throw notFound();
  res.download(absPath(v.file_path), `${v.kode}-v${v.versi}.docx`);
}));

/** Pratinjau template: setiap field tampil sebagai [nama_field]. */
r.get('/:id/versi/:vid/pratinjau', wrap(async (req, res) => {
  const v = await one('SELECT file_path,fields FROM template_versions WHERE id=$1 AND template_id=$2', [int(req.params.vid, 'Versi'), int(req.params.id, 'ID')]);
  if (!v) throw notFound();
  const buf = await fs.readFile(absPath(v.file_path));
  const values = Object.fromEntries(v.fields.map((f) => [f.name, `[${f.name}]`]));
  res.json({ html: await docxToHtml(renderDocx(buf, values)) });
}));

export default r;
