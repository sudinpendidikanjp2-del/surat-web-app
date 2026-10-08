import { one, q, pool, migrate } from './db.js';
import { hashPassword } from './security.js';
import { buildDocx, extractFields, DEFAULT_TEMPLATES } from './docx.js';
import { saveBuffer } from './storage.js';

const INITIAL_PASSWORD = process.env.SEED_PASSWORD || 'surat12345';

const UNITS = [
  { kode: 'PIM', nama: 'Pimpinan' },
  { kode: 'TU', nama: 'Tata Usaha' },
  { kode: 'DATA', nama: 'Seksi Data' },
];

const USERS = [
  { username: 'admin', nama: 'Admin Sistem', role: 'superadmin', unit: 'TU', jabatan: 'Administrator Sistem' },
  { username: 'tu', nama: 'Petugas Tata Usaha', role: 'tu', unit: 'TU', jabatan: 'Petugas Persuratan' },
  { username: 'pimpinan', nama: 'Kepala Kantor', role: 'pimpinan', unit: 'PIM', jabatan: 'Kepala', nip: '000000000000000001', pangkat: 'Pembina' },
  { username: 'kasi.data', nama: 'Kepala Seksi Data', role: 'pejabat', unit: 'DATA', jabatan: 'Kepala Seksi Data', nip: '000000000000000002', pangkat: 'Penata' },
  { username: 'andi', nama: 'Andi', role: 'pelaksana', unit: 'DATA', jabatan: 'Pelaksana' },
  { username: 'budi', nama: 'Budi', role: 'pelaksana', unit: 'DATA', jabatan: 'Pelaksana' },
  { username: 'viewer', nama: 'Pengamat', role: 'viewer', unit: 'TU', jabatan: 'Monitoring' },
];

/** Data dasar yang dibutuhkan agar sistem dapat dipakai: unit, akun awal, pengaturan, template bawaan. Idempoten. */
export async function ensureBaseData() {
  for (const u of UNITS) await q('INSERT INTO units(kode,nama) VALUES($1,$2) ON CONFLICT (kode) DO NOTHING', [u.kode, u.nama]);
  if ((await one('SELECT count(*) AS n FROM users')).n === 0) {
    const hash = await hashPassword(INITIAL_PASSWORD);
    for (const u of USERS) {
      const unit = await one('SELECT id FROM units WHERE kode=$1', [u.unit]);
      await q(
        `INSERT INTO users(username,nama,nip,pangkat,jabatan,role,unit_id,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [u.username, u.nama, u.nip || null, u.pangkat || null, u.jabatan, u.role, unit.id, hash],
      );
    }
    console.log(`Akun awal dibuat (${USERS.map((u) => u.username).join(', ')}). Kata sandi awal: ${INITIAL_PASSWORD}. Segera ganti.`);
  }
  const defaults = {
    instansi: { nama: 'Sudin Pendidikan JP2', alamat: '', kota: 'Jakarta', kode_unit: 'Sudin-JP2' },
    penomoran: { format: '{kode}/{urut}/{unit}/{bulan_romawi}/{tahun}', kode_default: '421', digits: 3 },
    sla: { Rendah: 5, Normal: 5, Tinggi: 3, Mendesak: 1 },
  };
  for (const [k, v] of Object.entries(defaults)) await q('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]);

  const admin = await one(`SELECT id FROM users WHERE username='admin'`);
  for (const t of DEFAULT_TEMPLATES) {
    if (await one('SELECT 1 FROM templates WHERE kode=$1', [t.kode])) continue;
    const buf = buildDocx(t.paragraphs);
    const rel = await saveBuffer(buf, 'docx');
    const tpl = await one(
      `INSERT INTO templates(nama,kode,jenis,deskripsi,kode_klasifikasi,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [t.nama, t.kode, t.jenis, t.deskripsi, t.kode_klasifikasi || null, admin?.id ?? null],
    );
    await q(
      `INSERT INTO template_versions(template_id,versi,catatan,file_path,fields,aktif,created_by) VALUES($1,1,'Template bawaan',$2,$3,TRUE,$4)`,
      [tpl.id, rel, JSON.stringify(extractFields(buf)), admin?.id ?? null],
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  await ensureBaseData();
  if (process.argv.includes('--demo')) {
    const { runDemo } = await import('./demo.js');
    const url = process.env.APP_URL || 'http://localhost:3000';
    await runDemo(url);
  }
  await pool.end();
}
