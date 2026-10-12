import type { Pool } from 'pg';
import { newTrackCode } from '@/domain/tracking';

/** Skema database. Idempoten: aman dijalankan setiap kali aplikasi menyala. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL UNIQUE,
  aktif BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  nip TEXT,
  pangkat TEXT,
  jabatan TEXT,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('superadmin','tu','pimpinan','pejabat','pelaksana','viewer')),
  unit_id INT REFERENCES units(id),
  password_hash TEXT NOT NULL,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS sequences (
  key TEXT PRIMARY KEY,
  last INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS letters_in (
  id SERIAL PRIMARY KEY,
  no_agenda TEXT NOT NULL UNIQUE,
  case_no TEXT NOT NULL UNIQUE,
  no_surat TEXT NOT NULL,
  tgl_surat DATE NOT NULL,
  tgl_diterima DATE NOT NULL,
  asal TEXT NOT NULL,
  instansi TEXT,
  alamat TEXT,
  perihal TEXT NOT NULL,
  jenis TEXT NOT NULL DEFAULT 'Surat Dinas',
  sifat TEXT NOT NULL DEFAULT 'Biasa' CHECK (sifat IN ('Biasa','Segera','Penting','Rahasia')),
  prioritas TEXT NOT NULL DEFAULT 'Normal' CHECK (prioritas IN ('Rendah','Normal','Tinggi','Mendesak')),
  lampiran TEXT,
  catatan TEXT,
  status TEXT NOT NULL DEFAULT 'DITERIMA',
  sla_due DATE,
  qr_token TEXT NOT NULL UNIQUE,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  diteruskan_at TIMESTAMPTZ,
  selesai_at TIMESTAMPTZ,
  arsip_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS letters_in_status_idx ON letters_in(status);
CREATE INDEX IF NOT EXISTS letters_in_tgl_idx ON letters_in(tgl_diterima);

CREATE TABLE IF NOT EXISTS dispositions (
  id SERIAL PRIMARY KEY,
  letter_in_id INT NOT NULL REFERENCES letters_in(id) ON DELETE CASCADE,
  parent_id INT REFERENCES dispositions(id),
  from_user_id INT NOT NULL REFERENCES users(id),
  to_user_id INT REFERENCES users(id),
  to_unit_id INT REFERENCES units(id),
  tindakan TEXT[] NOT NULL DEFAULT '{}',
  instruksi TEXT NOT NULL,
  deadline DATE,
  prioritas TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL DEFAULT 'BARU' CHECK (status IN ('BARU','DITERIMA','DITERUSKAN','DIKEMBALIKAN','SELESAI')),
  accepted_at TIMESTAMPTZ,
  return_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_user_id IS NOT NULL OR to_unit_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS dispositions_letter_idx ON dispositions(letter_in_id);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  letter_in_id INT NOT NULL REFERENCES letters_in(id) ON DELETE CASCADE,
  disposition_id INT REFERENCES dispositions(id),
  judul TEXT NOT NULL,
  deskripsi TEXT,
  pic_user_id INT NOT NULL REFERENCES users(id),
  assigner_id INT NOT NULL REFERENCES users(id),
  start_date DATE,
  deadline DATE,
  prioritas TEXT NOT NULL DEFAULT 'Normal',
  status TEXT NOT NULL DEFAULT 'BELUM_DIMULAI' CHECK (status IN ('BELUM_DIMULAI','DITERIMA','DIPROSES','MENUNGGU_DATA','MENUNGGU_KONFIRMASI','MENUNGGU_PERSETUJUAN','SELESAI','DIBATALKAN')),
  progress INT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  checklist JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  selesai_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS tasks_pic_idx ON tasks(pic_user_id, status);
CREATE INDEX IF NOT EXISTS tasks_letter_idx ON tasks(letter_in_id);

CREATE TABLE IF NOT EXISTS task_updates (
  id SERIAL PRIMARY KEY,
  task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  progress INT,
  status TEXT,
  catatan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id SERIAL PRIMARY KEY,
  nama TEXT NOT NULL,
  kode TEXT NOT NULL UNIQUE,
  jenis TEXT NOT NULL,
  deskripsi TEXT,
  kode_klasifikasi TEXT,
  aktif BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_versions (
  id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  versi INT NOT NULL,
  catatan TEXT,
  file_path TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '[]',
  aktif BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (template_id, versi)
);

CREATE TABLE IF NOT EXISTS letters_out (
  id SERIAL PRIMARY KEY,
  no_agenda TEXT NOT NULL UNIQUE,
  letter_in_id INT REFERENCES letters_in(id) ON DELETE SET NULL,
  template_version_id INT REFERENCES template_versions(id),
  jenis TEXT NOT NULL,
  perihal TEXT NOT NULL,
  tujuan TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','REVISI','MENUNGGU_PERSETUJUAN','DISETUJUI','NOMOR_DIBERIKAN','DITANDATANGANI','DIKIRIM','SELESAI','DITOLAK')),
  nomor_surat TEXT UNIQUE,
  tgl_surat DATE,
  penandatangan_id INT REFERENCES users(id),
  doc_version INT NOT NULL DEFAULT 0,
  created_by INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  sent_method TEXT
);
CREATE INDEX IF NOT EXISTS letters_out_status_idx ON letters_out(status);

CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  letter_out_id INT NOT NULL REFERENCES letters_out(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  aksi TEXT NOT NULL,
  catatan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attachments (
  id SERIAL PRIMARY KEY,
  letter_in_id INT REFERENCES letters_in(id) ON DELETE CASCADE,
  letter_out_id INT REFERENCES letters_out(id) ON DELETE CASCADE,
  task_id INT REFERENCES tasks(id) ON DELETE SET NULL,
  kategori TEXT NOT NULL,
  nama TEXT NOT NULL,
  mime TEXT NOT NULL,
  ukuran INT NOT NULL,
  path TEXT NOT NULL,
  versi INT NOT NULL DEFAULT 1,
  group_key TEXT NOT NULL,
  uploader_id INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (letter_in_id IS NOT NULL OR letter_out_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS attachments_in_idx ON attachments(letter_in_id);
CREATE INDEX IF NOT EXISTS attachments_out_idx ON attachments(letter_out_id);

CREATE TABLE IF NOT EXISTS confirmations (
  id SERIAL PRIMARY KEY,
  letter_in_id INT NOT NULL REFERENCES letters_in(id) ON DELETE CASCADE,
  tanggal DATE NOT NULL,
  metode TEXT NOT NULL,
  pihak TEXT NOT NULL,
  hasil TEXT NOT NULL,
  catatan TEXT,
  bukti_attachment_id INT REFERENCES attachments(id),
  user_id INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  letter_in_id INT REFERENCES letters_in(id) ON DELETE CASCADE,
  letter_out_id INT REFERENCES letters_out(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id),
  tipe TEXT NOT NULL,
  teks TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_in_idx ON events(letter_in_id, created_at);
CREATE INDEX IF NOT EXISTS events_out_idx ON events(letter_out_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tipe TEXT NOT NULL,
  judul TEXT NOT NULL,
  isi TEXT,
  link TEXT,
  dedupe_key TEXT UNIQUE,
  dibaca BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, dibaca, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  aksi TEXT NOT NULL,
  entitas TEXT,
  entitas_id TEXT,
  detail JSONB NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabel % tidak dapat diubah atau dihapus', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS events_immutable ON events;
CREATE TRIGGER events_immutable BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
`;

const MIGRATIONS = `
ALTER TABLE letters_in ADD COLUMN IF NOT EXISTS track_code TEXT UNIQUE;
ALTER TABLE letters_in ADD COLUMN IF NOT EXISTS track_enabled BOOLEAN NOT NULL DEFAULT TRUE;
`;

/** Buat tabel, terapkan migrasi kecil, dan beri kode pelacakan untuk surat lama yang belum punya. */
export async function migrate(pool: Pool) {
  // Satu kunci advisory: bila beberapa proses menyala bersamaan, hanya satu yang menjalankan migrasi.
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(SCHEMA);
    await client.query(MIGRATIONS);
    const rows = (await client.query<{ id: number; sifat: string }>('SELECT id, sifat FROM letters_in WHERE track_code IS NULL')).rows;
    for (const r of rows) await client.query('UPDATE letters_in SET track_code=$1, track_enabled=$2 WHERE id=$3', [newTrackCode(), r.sifat !== 'Rahasia', r.id]);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}
