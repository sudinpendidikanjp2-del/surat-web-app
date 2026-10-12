import type { Deps } from './context';

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
  { username: 'viewer', nama: 'Pengamat', role: 'viewer', unit: 'TU', jabatan: 'Pemantauan' },
] as const;

const DEFAULT_SETTINGS = {
  instansi: { nama: 'Sudin Pendidikan JP2', alamat: '', kota: 'Jakarta', kode_unit: 'Sudin-JP2' },
  penomoran: { format: '{kode}/{urut}/{unit}/{bulan_romawi}/{tahun}', kode_default: '421', digits: 3 },
  sla: { Rendah: 5, Normal: 5, Tinggi: 3, Mendesak: 1 },
};

/**
 * Data dasar agar sistem dapat dipakai: unit, akun awal, pengaturan, template bawaan. Idempoten.
 * Di produksi tanpa SEED_PASSWORD, kata sandi awal dibuat acak (yang dikenal publik tidak dipakai).
 */
export async function ensureBaseData(d: Deps, opts: { production: boolean; seedPassword?: string }) {
  await d.uow.run(async (r) => {
    for (const u of UNITS) await r.units.ensure(u.kode, u.nama);
    if ((await r.users.count()) === 0) {
      const generated = opts.production && !opts.seedPassword;
      const pw = opts.seedPassword || (generated ? d.tokens.create(12) : 'surat12345');
      const hash = await d.passwords.hash(pw);
      for (const u of USERS) {
        await r.users.insert({
          username: u.username, nama: u.nama, nip: 'nip' in u ? u.nip : null, pangkat: 'pangkat' in u ? u.pangkat : null,
          jabatan: u.jabatan, email: null, role: u.role, unit_id: await r.units.idByCode(u.unit), password_hash: hash,
        });
      }
      console.log(`Akun awal dibuat (${USERS.map((u) => u.username).join(', ')}). Kata sandi awal: ${pw}. Segera ganti.${generated ? ' (dibuat acak, catat sekarang, tidak ditampilkan lagi)' : ''}`);
    }
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) await r.settings.ensure(k, v);
    const adminId = await r.users.idByUsername('admin');
    for (const t of d.documents.defaultTemplates()) {
      if (await r.templates.codeExists(t.kode)) continue;
      const buf = d.documents.build(t.paragraphs);
      const path = await d.files.save(buf, 'docx');
      const id = await r.templates.insert({ nama: t.nama, kode: t.kode, jenis: t.jenis, deskripsi: t.deskripsi, kodeKlasifikasi: t.kode_klasifikasi || null, userId: adminId });
      await r.templates.addVersion({ templateId: id, catatan: 'Template bawaan', path, fields: d.documents.extractFields(buf), activate: true, userId: adminId });
    }
  });
}
