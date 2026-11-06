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
    `INSERT INTO letters_out(no_agenda,letter_in_id,jenis,sifat,perihal,tujuan,lampiran,catatan,nomor_surat,tgl_surat,penandatangan_id,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [l.no_agenda, l.letterInId, l.jenis, l.sifat, l.perihal, l.tujuan, l.lampiran, l.catatan, l.nomorSurat, l.tglSurat, l.signerId, l.createdBy],
  ))!,
  updateRecord: async (id, l) => {
    await db.q(
      `UPDATE letters_out SET jenis=$1,sifat=$2,perihal=$3,tujuan=$4,lampiran=$5,catatan=$6,nomor_surat=$7,tgl_surat=$8,penandatangan_id=$9,updated_at=now() WHERE id=$10`,
      [l.jenis, l.sifat, l.perihal, l.tujuan, l.lampiran, l.catatan, l.nomor_surat, l.tgl_surat, l.penandatangan_id, id],
    );
  },
  byNomor: (nomor, exceptId) => db.one('SELECT id,no_agenda FROM letters_out WHERE lower(nomor_surat)=lower($1) AND id<>$2', [nomor, exceptId ?? 0]),
  setNomor: async (id, nomor) => { await db.q('UPDATE letters_out SET nomor_surat=$1, updated_at=now() WHERE id=$2', [nomor, id]); },
  markSent: async (id, metode, tanggal) => {
    await db.q(`UPDATE letters_out SET status='DIKIRIM', sent_at=$3::date + (now()::time), sent_method=$2, updated_at=now() WHERE id=$1`, [id, metode, tanggal]);
  },
  cancel: async (id, alasan) => { await db.q(`UPDATE letters_out SET status='DIBATALKAN', batal_alasan=$2, updated_at=now() WHERE id=$1`, [id, alasan]); },
  signedCount: async (id) => (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM attachments WHERE letter_out_id=$1 AND kategori='TTD'`, [id]))!.n,
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
