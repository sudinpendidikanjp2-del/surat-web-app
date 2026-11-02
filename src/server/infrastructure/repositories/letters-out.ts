import type { LetterOut } from '@/domain/letter-out';
import type { LettersOutRepo, TemplatesRepo } from '@/server/application/ports';
import type { Db } from '../db/client';
import { visibleLettersOut } from '../db/visibility';

export const lettersOutRepo = (db: Db): LettersOutRepo => ({
  findVisible(actor, id) {
    const vis = visibleLettersOut(actor, 'lo', 1);
    return db.one<LetterOut>(`SELECT lo.* FROM letters_out lo WHERE lo.id=$1 AND ${vis.sql}`, [id, ...vis.params]);
  },
  exists: async (id) => Boolean(await db.one('SELECT 1 FROM letters_out WHERE id=$1', [id])),
  async isVisibleTo(user, id) {
    const vis = visibleLettersOut(user, 'lo', 1);
    return Boolean(await db.one(`SELECT 1 FROM letters_out lo WHERE lo.id=$1 AND ${vis.sql}`, [id, ...vis.params]));
  },
  lock: (id) => db.one<LetterOut>('SELECT * FROM letters_out WHERE id=$1 FOR UPDATE', [id]),
  insert: async (l) => (await db.one<LetterOut>(
    `INSERT INTO letters_out(no_agenda,letter_in_id,template_version_id,jenis,perihal,tujuan,fields,tgl_surat,penandatangan_id,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [l.no_agenda, l.letterInId, l.templateVersionId, l.jenis, l.perihal, l.tujuan, JSON.stringify(l.fields), l.tglSurat, l.signerId, l.createdBy],
  ))!,
  updateContent: async (id, l) => {
    await db.q('UPDATE letters_out SET perihal=$1,tujuan=$2,tgl_surat=$3,penandatangan_id=$4,fields=$5,updated_at=now() WHERE id=$6',
      [l.perihal, l.tujuan, l.tgl_surat, l.penandatangan_id, JSON.stringify(l.fields), id]);
  },
  setDocVersion: async (id, versi) => { await db.q('UPDATE letters_out SET doc_version=$1, updated_at=now() WHERE id=$2', [versi, id]); },
  setStatus: async (id, status) => { await db.q('UPDATE letters_out SET status=$1, updated_at=now() WHERE id=$2', [status, id]); },
  setNomor: async (id, nomor) => { await db.q('UPDATE letters_out SET nomor_surat=$1 WHERE id=$2', [nomor, id]); },
  markSent: async (id, metode) => { await db.q('UPDATE letters_out SET sent_at=now(), sent_method=$1 WHERE id=$2', [metode, id]); },
  addApproval: async (id, userId, aksi, catatan) => { await db.q('INSERT INTO approvals(letter_out_id,user_id,aksi,catatan) VALUES($1,$2,$3,$4)', [id, userId, aksi, catatan]); },
  approvals: (id) => db.all('SELECT a.*, u.nama AS user_nama FROM approvals a JOIN users u ON u.id=a.user_id WHERE a.letter_out_id=$1 ORDER BY a.id', [id]) as never,
  forLetterIn: (id) => db.all('SELECT id,no_agenda,nomor_surat,perihal,status FROM letters_out WHERE letter_in_id=$1 ORDER BY id', [id]) as never,
  timeline: (id) => db.all(`SELECT e.id,e.tipe,e.teks,e.meta,e.created_at,u.nama AS user_nama FROM events e LEFT JOIN users u ON u.id=e.user_id
                            WHERE e.letter_out_id=$1 ORDER BY e.created_at,e.id`, [id]) as never,
});

export const templatesRepo = (db: Db): TemplatesRepo => ({
  list: (onlyActive) => db.all(
    `SELECT t.id,t.nama,t.kode,t.jenis,t.deskripsi,t.kode_klasifikasi,t.aktif,t.created_at, u.nama AS dibuat_oleh,
            (SELECT count(*) FROM template_versions v WHERE v.template_id=t.id) AS jumlah_versi,
            (SELECT v.id FROM template_versions v WHERE v.template_id=t.id AND v.aktif LIMIT 1) AS versi_aktif_id,
            (SELECT v.versi FROM template_versions v WHERE v.template_id=t.id AND v.aktif LIMIT 1) AS versi_aktif
       FROM templates t LEFT JOIN users u ON u.id=t.created_by ${onlyActive ? 'WHERE t.aktif' : ''} ORDER BY t.nama`,
  ) as never,
  find: (id) => db.one('SELECT * FROM templates WHERE id=$1', [id]),
  versions: (id, onlyActive) => db.all(
    `SELECT v.id,v.versi,v.catatan,v.fields,v.aktif,v.created_at,u.nama AS dibuat_oleh FROM template_versions v LEFT JOIN users u ON u.id=v.created_by
      WHERE v.template_id=$1 ${onlyActive ? 'AND v.aktif' : ''} ORDER BY v.versi DESC`, [id],
  ) as never,
  version: (id) => db.one('SELECT * FROM template_versions WHERE id=$1', [id]),
  versionWithTemplate: (id) => db.one(
    `SELECT v.*, t.jenis, t.aktif AS template_aktif, t.nama AS template_nama FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1`, [id],
  ),
  versionOf: (templateId, versionId) => db.one(
    'SELECT v.*, t.kode FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1 AND v.template_id=$2', [versionId, templateId],
  ),
  classificationCode: async (versionId) => (await db.one<{ k: string | null }>(
    'SELECT t.kode_klasifikasi AS k FROM template_versions v JOIN templates t ON t.id=v.template_id WHERE v.id=$1', [versionId],
  ))?.k ?? null,
  codeExists: async (kode) => Boolean(await db.one('SELECT 1 FROM templates WHERE kode=$1', [kode])),
  insert: async (t) => (await db.one<{ id: number }>(
    'INSERT INTO templates(nama,kode,jenis,deskripsi,kode_klasifikasi,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [t.nama, t.kode, t.jenis, t.deskripsi, t.kodeKlasifikasi, t.userId],
  ))!.id,
  update: async (id, t) => Boolean(await db.one(
    'UPDATE templates SET nama=$1, jenis=$2, deskripsi=$3, kode_klasifikasi=$4, aktif=$5 WHERE id=$6 RETURNING id',
    [t.nama, t.jenis, t.deskripsi, t.kodeKlasifikasi, t.aktif, id],
  )),
  async addVersion(v) {
    const next = (await db.one<{ v: number }>('SELECT COALESCE(max(versi),0)+1 AS v FROM template_versions WHERE template_id=$1', [v.templateId]))!.v;
    if (v.activate) await db.q('UPDATE template_versions SET aktif=FALSE WHERE template_id=$1', [v.templateId]);
    return (await db.one<{ id: number; versi: number }>(
      'INSERT INTO template_versions(template_id,versi,catatan,file_path,fields,aktif,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,versi',
      [v.templateId, next, v.catatan, v.path, JSON.stringify(v.fields), v.activate, v.userId],
    ))!;
  },
  async activate(templateId, versionId) {
    const v = await db.one<{ versi: number }>('SELECT versi FROM template_versions WHERE id=$1 AND template_id=$2', [versionId, templateId]);
    if (!v) return null;
    await db.q('UPDATE template_versions SET aktif=FALSE WHERE template_id=$1', [templateId]);
    await db.q('UPDATE template_versions SET aktif=TRUE WHERE id=$1', [versionId]);
    return v.versi;
  },
  setFields: async (versionId, fields) => { await db.q('UPDATE template_versions SET fields=$1 WHERE id=$2', [JSON.stringify(fields), versionId]); },
});
