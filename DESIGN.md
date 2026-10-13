# DESIGN.md

Arah desain Sistem Surat dan Disposisi (Next.js, Tailwind, shadcn/ui, React Query). Sasaran: alat kerja harian yang **cepat dipindai dan jelas langkah berikutnya**, untuk TU, pimpinan, pejabat, dan pelaksana yang membuka aplikasi berkali-kali sehari.

Skill yang dipakai: antislop (filter mutu, mode DURING) dan emil-design-eng dari `npx skills add emilkowalski/skill` (aturan gerak: frekuensi menentukan animasi, ease-out kuat, tekan 0.97, menu muncul dari pemicunya, dialog berpusat).

Design Read: aplikasi kerja internal kantor pemerintah untuk pegawai administrasi, bahasa visual kertas hangat dan tinta hijau, padat tetapi tenang; dial **ENERGY 1 / RHYTHM 2 / MOTION 2**.

- ENERGY 1: ini alat kerja. Yang menonjol adalah tenggat, status, dan tombol tindakan, bukan dekorasi.
- RHYTHM 2: daftar (tabel), detail (dua kolom: isi dan keadaan), dan beranda (antrian kerja dan angka) sengaja berbeda komposisi.
- MOTION 2: umpan balik tekan, menu, dialog, dan bilah aksi massal bergerak singkat; navigasi dan pilihan tampilan tidak dianimasikan karena dipakai puluhan kali sehari.

## Identitas

- **Stempel agenda**: nomor agenda dalam bingkai tipis seperti cap penerimaan surat. Muncul di setiap tempat nomor agenda tampil, tidak dipakai untuk hal lain.
- **Benang urusan**: tahapan surat sebagai garis vertikal bercentang (Steps), di kolom keadaan halaman detail dan di halaman lacak umum.
- **Satu titik fokus per layar**: beranda membuka dengan "Perlu tindakan Anda"; halaman detail dengan kartu "Langkah berikutnya" yang memuat tepat satu tombol utama. Tindakan lain ada di menu "Aksi lain" di kanan atas.

## Warna

Netral hangat (kertas) dan satu aksen hijau tinta. Hijau dipilih karena nuansa dokumen resmi dan cap dinas. Warna status (hijau, kuning, merah) hanya untuk tenggat dan status, selalu disertai tulisan dan ikon berbeda bentuk.

| Token | Terang | Gelap | Kontras |
|---|---|---|---|
| Teks / latar | `#1a1a18` / `#f6f4ef` | `#ecebe6` / `#121513` | 15.9 / 15.4 |
| Teks sekunder / kartu | `#57534b` / `#ffffff` | `#aeb2ab` / `#1b1f1c` | 7.7 / 7.8 |
| Tombol utama (teks / isi) | `#ffffff` / `#0b6b57` | `#08140f` / `#4fbf9c` | 6.5 / 8.3 |
| Tautan di latar | `#0b6b57` | `#4fbf9c` | 5.9 / 8.1 |
| Terlambat | `#b42318` di `#fdecea` | `#f4877b` di `#3a1b18` | 5.8 / 6.4 |
| Perlu perhatian | `#7f4d00` di `#fcf1d8` | `#f0c063` di `#33280f` | 6.3 / 8.6 |
| Selesai | `#1b6b3a` di `#e6f3ea` | `#74d39a` di `#16301f` | 5.7 / 7.8 |
| Bingkai isian | `#8a8478` | `#7a827c` | 3.7 / 4.2 (syarat 3:1) |

Semua teks memenuhi WCAG AA, sebagian besar AAA. Tema gelap: hijau dinaikkan kecerahannya dan teks di atasnya menjadi gelap, latar abu kehijauan agar tidak hitam pekat.

## Tema

Bawaan mengikuti perangkat; dapat dipilih Terang, Gelap, atau Ikuti perangkat lewat ikon di kepala halaman. Pilihan disimpan di peramban (`localStorage`). Skrip kecil di `<head>` memasang tema sebelum halaman tampil sehingga tidak berkedip. Semua warna adalah token (`globals.css`), tidak ada warna tetap di komponen, jadi kedua tema memakai komponen yang sama.

## Huruf

Atkinson Hyperlegible Next (Braille Institute): bentuk 1, l, I, 0, O dibedakan jelas, penting untuk nomor surat dan nomor agenda yang sering dicocokkan dengan kertas. Disajikan sendiri dari paket npm. Dasar 16px; keterangan 14px; judul halaman 24px. Isian selalu 16px agar iOS tidak memperbesar halaman.

## Ukuran dan bentuk

- Tombol dan isian 40px di layar lebar, 44px di layar sentuh (target ketuk). Tombol kecil 32px hanya di layar lebar.
- Radius 6px (penanda), 8px (kontrol), 12px (kartu), 14px (dialog). Tidak ada bentuk kapsul.
- Kartu berbingkai tipis tanpa bayangan. Bayangan hanya untuk yang benar-benar melayang: dialog, menu, bilah aksi massal, dan pesan.
- Daftar: tabel di layar lebar (banyak surat sekaligus terpindai), daftar ringkas di ponsel. Tidak ada gulir ke samping.

## Navigasi

- Layar lebar: menu samping berkelompok. Kelompok pertama tanpa judul (Beranda, Surat Masuk, Pekerjaan Saya, Surat Keluar), lalu Telusuri (Cari, Arsip, Laporan), lalu Pengelolaan sesuai peran. Butir yang perlu perhatian memberi angka merah.
- Ponsel: bilah bawah empat tujuan (Beranda, Surat Masuk, Pekerjaan atau Surat Keluar, Lainnya). "Lainnya" memuat sisanya.
- Kepala halaman: pemberitahuan (dengan angka), tampilan, dan menu akun (Akun dan kata sandi, Keluar). Akun ditandai inisial, bukan foto, karena aplikasi tidak menyimpan foto pegawai.

## Aksi massal

Centang baris (atau "pilih semua di halaman ini"), lalu bilah muncul di bawah dengan jumlah terpilih dan tindakan yang berlaku untuk peran itu. Setiap tindakan meminta konfirmasi yang menyebut jumlah dan akibatnya. Server memproses satu per satu; pesan hasil merangkum, dan bila ada yang gagal, dialog menyebut alasannya per surat. Pilihan dikosongkan saat tampilan, pencarian, atau halaman berganti, agar tidak ada data tersembunyi yang ikut terproses.

## Gerak (emil-design-eng)

- Kurva `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. Tidak ada `ease-in`, tidak ada `transition: all`.
- Tekan: `scale(0.97)` 160ms pada tombol dan pilihan (kelas `pressable`), mati bila perangkat meminta gerak dikurangi.
- Menu: 150ms dari skala 0.97, `transform-origin` dari pemicu (Radix). Keluar 100ms.
- Dialog: 200ms masuk, 150ms keluar. Di layar lebar membesar dari 0.97 di tengah (tidak terikat pemicu); di ponsel naik dari bawah.
- Bilah aksi massal: 200ms naik dan memudar. Alasan: menghubungkan centang di daftar dengan tindakan di bawah.
- Tidak dianimasikan: pindah halaman, pilihan tampilan, sorot baris, tab. Dipakai puluhan kali sehari.
- `prefers-reduced-motion`: durasi praktis nol.

## Keadaan data

Setiap data punya memuat (kerangka abu, kalimat untuk pembaca layar), galat (kotak merah dengan "Muat ulang"), kosong (apa artinya dan apa yang dapat dilakukan; versi ringkas di dalam halaman detail), dan isi. Pesan hasil tindakan menyebut apa yang terjadi ("2 data berhasil diteruskan").

## Akses

Semua kontrol dapat dipakai dengan keyboard: Tab, Enter, Spasi, panah di menu, Escape menutup menu dan dialog. Cincin fokus 2px berwarna aksen. Tautan "Lewati ke isi halaman" di awal. Kotak centang punya label untuk pembaca layar ("Pilih <perihal>").

## Nama dan ikon

Nama aplikasi ditulis sebagai teks. Tidak ada logo rekaan; logo instansi dipasang bila sudah diberikan. Ikon dari lucide, dipilih per makna (kotak masuk untuk surat masuk, tas untuk pekerjaan, lonceng untuk pemberitahuan) dan selalu disertai tulisan, kecuali tombol ikon di kepala halaman yang berlabel untuk pembaca layar.
