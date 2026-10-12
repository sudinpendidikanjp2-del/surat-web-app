# DESIGN.md

Arah desain Sistem Surat dan Disposisi setelah pindah ke Next.js, Tailwind, shadcn/ui, dan React Query. Sasaran utama: **mudah dipakai oleh pegawai lanjut usia** yang jarang memakai aplikasi, membaca dengan kacamata, dan takut salah tekan.

Skill yang dipakai: antislop (filter mutu, mode DURING), emil-design-eng dari `npx skills add emilkowalski/skill` (hanya bagian yang cocok: frekuensi menentukan gerak, umpan balik tekan, tanpa `transition: all`). Bagian pegas, laci geser, dan menu popover dari arah sebelumnya sengaja dibuang karena bertentangan dengan sasaran di atas.

Design Read: alat kerja harian kantor pemerintah untuk TU, pimpinan, dan pegawai senior; bahasa visual kertas dan tinta, tenang, huruf besar; dial ENERGY 1 / RHYTHM 1 / MOTION 1.

## Tiga prioritas yang dipilih pengguna

1. **Lebih sedikit pilihan.**
   - Menu utama enam butir di layar lebar (Beranda, Surat Masuk, Pekerjaan Saya, Surat Keluar, Cari Surat, Menu Lainnya) dan empat di ponsel. Arsip, laporan, dan pengaturan pindah ke "Menu Lainnya", masing-masing dengan satu kalimat penjelasan.
   - Disposisi dan tugas digabung menjadi satu halaman "Pekerjaan Saya". Alamat lama `/disposisi` dan `/tugas` dialihkan ke sana.
   - Halaman surat dibuka dengan kartu **"Langkah berikutnya"**: satu kalimat apa yang perlu dilakukan sekarang dan tepat satu tombol utama. Tindakan lain tampil sebagai daftar tombol biasa di bawah judul "Yang juga bisa Anda lakukan", tidak tersembunyi di menu tarik-turun.
   - Aksi massal (kotak centang banyak baris, bilah aksi) dihapus dari tampilan. API-nya tetap ada. Alasannya: satu klik salah berdampak ke banyak surat, dan pola "pilih lalu cari tombolnya" sulit bagi pengguna baru.
   - Tab diganti bagian bertumpuk dengan judul jelas. Orang tidak perlu tahu ada isi tersembunyi di tab lain.
   - Saringan berupa tombol besar yang jelas terpilih ("Perlu tindakan", "Semua"), bukan popover dan chip.
2. **Bahasa sederhana.**
   - Label status ditulis sebagai kalimat sehari-hari: "Menunggu arahan pimpinan", "Sedang dikerjakan", "Batas waktu hari ini", "Terlambat 2 hari".
   - Tombol menyebut tindakannya lengkap: "Kirim Disposisi", "Simpan Kata Sandi Baru", "Tandai Semua Sudah Dibaca". Tidak ada "OK", "Submit", atau ikon tanpa tulisan.
   - Setiap halaman punya satu kalimat "halaman ini untuk apa" di bawah judul, dan tautan kembali di tempat yang sama.
   - Isian formulir menulis "(wajib)" atau "(boleh dikosongkan)" sebagai kata, bukan bintang merah.
   - Pesan galat menyebut apa yang harus dilakukan ("Periksa sambungan internet Anda, lalu coba lagi").
   - Peran diberi nama yang dikenal: "Admin Sistem", "Pemantau".
3. **Kontras tinggi.** Semua teks memenuhi WCAG AAA (7:1). Hanya tema terang: kertas dan tinta hitam, seperti surat yang mereka pegang. Tema gelap tidak dibuat karena pilihan tambahan adalah beban, dan kontras di tema gelap sering turun di layar murah.

## Warna

| Pemakaian | Teks | Latar | Rasio |
|---|---|---|---|
| Isi | `#141414` | latar `#f4f2ec` | 16.5 |
| Isi di kartu | `#141414` | `#ffffff` | 18.4 |
| Teks keterangan | `#383838` | `#f4f2ec` | 10.5 |
| Tombol utama | `#ffffff` | `#0b5a48` | 8.2 |
| Tautan | `#0b5a48` | `#f4f2ec` | 7.3 |
| Terlambat | `#8d1c13` | `#fbe9e7` | 7.8 |
| Perlu perhatian | `#5c3a00` | `#fdf1d3` | 9.1 |
| Selesai | `#134d2a` | `#e3f2e7` | 8.5 |
| Petunjuk isian (placeholder) | `#5d584c` | `#ffffff` | 7.1 |
| Bingkai isian | `#5d584c` | `#ffffff` | 7.1 (syarat 3:1) |

Satu aksen hijau tinta. Warna status selalu disertai tulisan dan ikon, tidak pernah warna saja. Tautan selalu bergaris bawah tebal (2px).

## Huruf

Atkinson Hyperlegible Next (dari Braille Institute, dirancang untuk pembaca dengan penglihatan rendah: bentuk 1, l, I, 0, O dibedakan jelas). Disajikan sendiri dari paket `@fontsource-variable`, tanpa memanggil layanan luar. Ukuran dasar 18px, tidak ada teks di bawah 16px, judul halaman 30 sampai 36px, jarak baris 1.6.

## Ukuran sentuh dan bentuk

- Tombol 52px (kecil 44px, besar 60px), selalu dengan tulisan. Isian 52px dengan bingkai 2px.
- Baris pilihan (radio, kotak centang) setinggi 52px dan seluruh barisnya dapat diketuk.
- Cincin fokus 3px berjarak 3px, selalu terlihat saat memakai keyboard. Tautan "Lewati ke isi halaman" di awal.
- Radius 6 sampai 14px. Tidak ada bayangan bertumpuk, tidak ada kaca buram.
- Daftar berupa kartu, bukan tabel lebar: tidak perlu menggulir ke samping di ponsel. Tabel hanya di laporan.
- Halaman: kalimat "Menampilkan 1 sampai 20 dari 57" dan dua tombol besar "Halaman Sebelumnya" dan "Halaman Berikutnya".
- Dialog: di ponsel naik dari bawah selebar layar, di layar lebar di tengah. Tombol "Tutup" bertulisan, "Batal" di kiri dan tindakan di kanan. Dialog hanya dipasang saat dibuka.

## Gerak

Hampir tidak ada. Hanya perubahan warna saat disentuh dan pudar singkat saat dialog muncul. Tidak ada pegas, geser, atau animasi angka: gerakan membuat pengguna lanjut usia ragu apakah layar sudah selesai berubah. `prefers-reduced-motion` mematikan semuanya.

## Keadaan data

Setiap data punya empat keadaan yang ditulis: memuat ("Sedang memuat data…" dengan kalimat, bukan kerangka abu saja), galat (kotak merah dengan tombol "Coba Muat Lagi"), kosong (kalimat apa artinya dan apa yang bisa dilakukan), dan isi. Pesan hasil tindakan muncul di atas layar selama 8 detik dengan tombol tutup, dan menyebut apa yang terjadi ("Disposisi sudah dikirim kepada Seksi Data").

## Nama dan ikon

Nama aplikasi ditulis sebagai teks. Tidak ada logo rekaan; logo instansi dipasang bila sudah diberikan.
