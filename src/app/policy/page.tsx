import type { Metadata } from 'next';
import { LegalPage, type LegalSection } from '@/features/legal/legal-page';
import { getBranding, getOffice } from '@/server/branding';

export const metadata: Metadata = { title: 'Kebijakan Privasi', robots: { index: true, follow: true } };

/** Versi dokumen; ubah bila isi kebijakan berubah. */
const VERSI = '2 November 2026';

/** Kebijakan privasi publik. Isinya menggambarkan perilaku aplikasi ini apa adanya; fitur opsional disebut sebagai opsional. */
export default async function PolicyPage() {
  const [b, office] = await Promise.all([getBranding(), getOffice()]);
  const sections: LegalSection[] = [
    {
      id: 'pengelola', judul: 'Siapa pengelola data',
      isi: <p>{b.nama} adalah aplikasi persuratan internal milik <b>{office.nama}</b>{office.alamat ? ` (${office.alamat})` : ''}. Kantor tersebut adalah pengelola data: menentukan siapa yang mendapat akun, surat apa yang dicatat, dan berapa lama data disimpan. Aplikasi berjalan di server yang dikelola kantor tersebut.</p>,
    },
    {
      id: 'data', judul: 'Data yang diproses',
      isi: (
        <ul>
          <li><b>Akun pegawai:</b> nama pengguna, nama, NIP, pangkat, jabatan, unit kerja, email (bila diisi admin), peran, dan kata sandi yang disimpan hanya dalam bentuk hash.</li>
          <li><b>Surat dan pekerjaan:</b> nomor dan tanggal surat, pengirim atau tujuan, perihal, lampiran berkas, disposisi, tugas, komentar, persetujuan, dan isi surat keluar.</li>
          <li><b>Catatan kegiatan:</b> siapa melakukan apa dan kapan, termasuk masuk dan gagal masuk, beserta alamat IP bila diketahui. Catatan ini tidak dapat diubah atau dihapus dari aplikasi.</li>
          <li><b>Pengirim surat yang melacak suratnya:</b> hanya kode lacak yang diketik. Halaman lacak tidak meminta nama atau kontak, dan hanya menampilkan tahapan umum, tanpa isi surat, nama pegawai, atau catatan internal.</li>
        </ul>
      ),
    },
    {
      id: 'tujuan', judul: 'Untuk apa data dipakai',
      isi: <p>Data hanya dipakai untuk administrasi persuratan kantor: mencatat surat, mendisposisikan dan menindaklanjutinya, membuat surat keluar, mengingatkan tenggat, menyusun laporan, menjaga keamanan akun, dan menelusuri kegiatan bila diperlukan. Data tidak dijual, tidak dipakai untuk iklan, dan tidak dipakai untuk membuat profil pengguna.</p>,
    },
    {
      id: 'cookie', judul: 'Cookie dan penyimpanan di peramban',
      isi: (
        <ul>
          <li>Satu cookie sesi (<code>sid</code>, HttpOnly) setelah Anda masuk, agar Anda tetap masuk. Cookie ini dihapus saat Anda keluar atau sesi berakhir.</li>
          <li>Pilihan tampilan terang atau gelap disimpan di peramban Anda sendiri.</li>
          <li>Tidak ada analitik, piksel pelacak, atau iklan pihak ketiga. Huruf dan ikon disajikan dari server aplikasi sendiri.</li>
        </ul>
      ),
    },
    {
      id: 'pihak-ketiga', judul: 'Layanan pihak ketiga (opsional)',
      isi: (
        <>
          <p>Fitur berikut hanya berjalan bila diaktifkan oleh admin kantor:</p>
          <ul>
            <li><b>Google Gemini</b> untuk membaca foto surat masuk (OCR). Bila aktif, foto atau halaman pertama PDF yang diunggah petugas dikirim ke Google untuk dibaca, dan hasilnya hanya menjadi usulan isian yang diperiksa petugas. Tanpa Gemini, pembacaan dilakukan di server sendiri.</li>
            <li><b>Google Drive dan Google Spreadsheet</b> untuk menyalin lampiran surat dan rekap daftar surat ke akun Google milik kantor. Dengan akun Google biasa, aplikasi meminta izin <code>drive.file</code> (hanya berkas yang dibuat aplikasi ini) dan <code>spreadsheets</code> (menulis lembar rekap), dan tidak membaca berkas lain di Drive Anda. Dengan akun layanan Google Workspace, aplikasi hanya menjangkau folder Shared Drive yang dibagikan admin kepada akun layanan itu.</li>
          </ul>
          <p>Penggunaan dan pemindahan informasi yang diterima dari Google API oleh aplikasi ini mematuhi <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer">Kebijakan Data Pengguna Layanan Google API</a>, termasuk persyaratan Penggunaan Terbatas (Limited Use). Data dari Google hanya dipakai untuk menjalankan fitur salinan dan rekap di atas, tidak dipindahkan ke pihak lain, tidak dipakai untuk iklan, dan tidak dipakai untuk melatih model kecerdasan buatan.</p>
        </>
      ),
    },
    {
      id: 'keamanan', judul: 'Keamanan',
      isi: <p>Kata sandi disimpan sebagai hash scrypt, token sesi disimpan sebagai hash, akses dibatasi menurut peran dan penugasan, lampiran hanya dapat dibuka lewat aplikasi oleh pengguna yang berhak, dan percobaan masuk dibatasi. Koneksi ke aplikasi memakai HTTPS bila dipasang sesuai panduan. Kredensial Google disimpan di server dan tidak pernah dikirim ke peramban.</p>,
    },
    {
      id: 'simpan', judul: 'Lama penyimpanan dan cadangan',
      isi: <p>Data disimpan selama dibutuhkan untuk administrasi persuratan, mengikuti jadwal retensi arsip {office.nama}. Admin dapat membuat cadangan seluruh data, termasuk salinan ke Google Drive kantor bila diaktifkan; cadangan lama dihapus menurut jumlah yang ditentukan admin. Kode lacak untuk pengirim surat berhenti berlaku 30 hari setelah surat selesai dan dapat dimatikan kapan saja.</p>,
    },
    {
      id: 'hak', judul: 'Hak Anda',
      isi: <p>Pegawai dapat meminta admin kantor memperbaiki data akunnya atau menonaktifkan akunnya. Pengirim surat dan pihak lain yang datanya tercatat dalam surat dapat menghubungi {office.nama} untuk menanyakan, memperbaiki, atau meminta penghapusan data sejauh tidak bertentangan dengan kewajiban kearsipan dan ketentuan perundang-undangan yang berlaku, termasuk Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi.</p>,
    },
    {
      id: 'kontak', judul: 'Kontak dan perubahan',
      isi: <p>Pertanyaan tentang kebijakan ini dapat disampaikan kepada {office.nama}{office.alamat ? `, ${office.alamat}` : ''}. Bila kebijakan ini berubah, versi baru ditampilkan di halaman ini dengan tanggal versi yang diperbarui.</p>,
    },
  ];
  return <LegalPage judul="Kebijakan Privasi" ringkas={`Bagaimana ${b.nama} mengumpulkan, memakai, dan menjaga data.`} versi={VERSI} pengelola={office} sections={sections} />;
}
