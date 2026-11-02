import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/features/legal/legal-page';
import { getBranding, getOffice } from '@/server/branding';

export const metadata: Metadata = { title: 'Ketentuan Layanan', robots: { index: true, follow: true } };

/** Versi dokumen; ubah bila isi ketentuan berubah. */
const VERSI = '2 November 2026';

export default async function TosPage() {
  const [b, office] = await Promise.all([getBranding(), getOffice()]);
  const sections: LegalSection[] = [
    {
      id: 'layanan', judul: 'Tentang layanan',
      isi: <p>{b.nama} adalah aplikasi persuratan internal {office.nama} untuk mencatat surat masuk, disposisi, tindak lanjut, dan surat keluar. Halaman <Link href="/lacak">Lacak Surat</Link> dapat dipakai siapa saja yang memiliki kode lacak dari tanda terima.</p>,
    },
    {
      id: 'akun', judul: 'Akun dan akses',
      isi: (
        <ul>
          <li>Akun hanya dibuat oleh admin kantor untuk pegawai yang berwenang. Pendaftaran mandiri tidak tersedia.</li>
          <li>Anda bertanggung jawab menjaga kerahasiaan kata sandi dan tidak membagikan akun. Segera ganti kata sandi awal, dan beri tahu admin bila akun Anda diduga dipakai orang lain.</li>
          <li>Hak akses mengikuti peran dan penugasan. Mencoba membuka data di luar hak Anda tidak diperbolehkan dan tercatat di catatan kegiatan.</li>
        </ul>
      ),
    },
    {
      id: 'pemakaian', judul: 'Pemakaian yang diperbolehkan',
      isi: (
        <ul>
          <li>Gunakan aplikasi hanya untuk urusan kedinasan {office.nama}.</li>
          <li>Jangan mengunggah berkas berbahaya, berkas yang bukan milik urusan surat, atau informasi yang tidak berhak Anda bagikan.</li>
          <li>Jangan mencoba melewati pembatasan keamanan, membebani server secara sengaja, atau mengakses aplikasi dengan cara otomatis tanpa izin pengelola.</li>
          <li>Kode lacak hanya untuk pengirim surat yang bersangkutan; jangan menebak atau mengumpulkan kode milik orang lain.</li>
        </ul>
      ),
    },
    {
      id: 'isi', judul: 'Kebenaran isi',
      isi: <p>Petugas bertanggung jawab atas kebenaran data yang dicatat. Hasil pembacaan otomatis foto surat (OCR) dan isian dari template hanyalah bantuan yang wajib diperiksa sebelum disimpan. Nomor surat keluar diberikan sistem setelah persetujuan pimpinan; dokumen yang sah tetap dokumen yang ditandatangani sesuai tata naskah dinas.</p>,
    },
    {
      id: 'google', judul: 'Integrasi Google (opsional)',
      isi: <p>Bila admin menghubungkan akun Google kantor, aplikasi menyalin lampiran dan rekap ke Google Drive dan Google Spreadsheet kantor tersebut. Pemakaian layanan Google juga tunduk pada ketentuan Google. Rincian data yang dipakai ada di <Link href="/policy">Kebijakan Privasi</Link>.</p>,
    },
    {
      id: 'ketersediaan', judul: 'Ketersediaan dan perubahan',
      isi: <p>Pengelola berupaya menjaga aplikasi tetap tersedia dan datanya dicadangkan, tetapi layanan dapat terhenti untuk pemeliharaan atau karena gangguan. Fitur dan ketentuan ini dapat berubah; versi terbaru selalu ditampilkan di halaman ini. Pengelola dapat menonaktifkan akun yang melanggar ketentuan.</p>,
    },
    {
      id: 'hukum', judul: 'Hukum yang berlaku dan kontak',
      isi: <p>Ketentuan ini tunduk pada peraturan perundang-undangan Republik Indonesia dan ketentuan internal {office.nama}. Pertanyaan dapat disampaikan kepada {office.nama}{office.alamat ? `, ${office.alamat}` : ''}.</p>,
    },
  ];
  return <LegalPage judul="Ketentuan Layanan" ringkas={`Aturan pemakaian ${b.nama}.`} versi={VERSI} pengelola={office} sections={sections} />;
}
