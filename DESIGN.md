# DESIGN.md

Arah desain Sistem Surat dan Disposisi (Next.js, Tailwind, shadcn/ui, React Query).

**Sumber arah:** gambar referensi dari pemilik produk (kumpulan layar dasbor dengan menu samping putih, item aktif berbentuk kapsul navy, tombol utama kuning berbentuk kapsul, kartu putih bersudut besar di atas latar abu sangat muda, kartu statistik berangka besar, chip status lembut, dan halaman masuk terbagi dua). Pemilik meminta tampilan dibuat seperti referensi itu, jadi kemiripan gaya adalah keputusan pemilik, bukan tiruan tanpa diminta (R-30). Skill yang dipakai sebagai filter: antislop (mode DURING) dan emil-design-eng dari `npx skills add emilkowalski/skill`. Grafik mengikuti skill dataviz.

Design Read: aplikasi kerja internal kantor pemerintah untuk TU, pimpinan, pejabat, dan pelaksana, bahasa visual dasbor modern bernavy dan kuning, padat tetapi lega; dial **ENERGY 2 / RHYTHM 2 / MOTION 2**.

- ENERGY 2: kuning cerah dan angka besar memberi semangat seperti referensi, tetapi hanya di titik yang penting.
- RHYTHM 2: beranda (kartu statistik, grafik, antrian), daftar (tabel dalam panel), detail (dua kolom), dan halaman masuk (terbagi dua) sengaja berbeda komposisi.
- MOTION 2: tekan, menu, dialog, dan bilah aksi massal bergerak singkat; pindah halaman dan tab tidak dianimasikan.

## Identitas

- **Navy dan kuning.** Navy `#1e1f4f` untuk tinta, menu aktif, dan tombol penting kedua. Kuning `#ffd233` hanya sebagai isi tombol atau penanda, dengan teks navy di atasnya (11.9:1). Kuning tidak pernah dipakai sebagai warna teks atau garis di latar putih (1.45:1).
- **Satu kuning per layar.** Tindakan utama halaman memakai tombol kuning; tombol cepat di menu samping memakai navy agar tidak bersaing.
- **Stempel agenda.** Nomor agenda dalam bingkai putus-putus seperti cap penerimaan surat, di setiap tempat nomor agenda tampil.
- **Benang urusan.** Tahapan surat sebagai garis vertikal: selesai bercentang navy, tahap sekarang kuning.
- **Langkah berikutnya.** Halaman detail dibuka dengan kartu kuning muda berisi satu tindakan utama; tindakan lain di menu "Aksi lain".

## Warna

| Token | Terang | Gelap | Kontras |
|---|---|---|---|
| Teks / latar | `#16173a` / `#f4f5f9` | `#ecedf6` / `#0f1024` | 15.8 / 16.1 |
| Teks sekunder / kartu | `#5f6280` / `#ffffff` | `#a7aac6` / `#181a36` | 5.9 / 7.4 |
| Menu aktif (teks / isi) | `#ffffff` / `#1e1f4f` | `#16173a` / `#c9cbff` | 15.4 / 11.1 |
| Tombol utama | `#16173a` di `#ffd233` | sama | 11.9 |
| Terlambat | `#c4282d` di `#fdecec` | `#ff8a8a` di `#3b1a1d` | 5.0 / 6.9 |
| Perlu perhatian | `#8a5a00` di `#fff3d6` | `#f2c14e` di `#33290f` | 5.4 / 8.5 |
| Selesai | `#0f7a43` di `#e5f6ec` | `#5bd99a` di `#11301f` | 4.8 / 8.1 |
| Bingkai isian | `#8f92ab` | `#6e72a0` | 3.1 / 3.7 (syarat 3:1) |

Semua teks memenuhi WCAG AA. Tema gelap memakai navy pekat; menu aktif berubah menjadi lavender terang dengan teks navy agar tetap terbaca.

**Grafik** (diuji dengan `validate_palette.js` dari skill dataviz): tema terang indigo `#4b4fc4` dan amber `#c99400`, tema gelap `#7275e6` dan `#bb8c12`. Lolos pita kecerahan, kroma, pemisahan buta warna, dan pemisahan normal. Amber di tema terang di bawah 3:1 terhadap latar, jadi grafik selalu punya legenda, tooltip angka, dan tombol "Lihat tabel".

## Huruf

Plus Jakarta Sans, karya foundry Indonesia (Tokotype): geometris dan bersih seperti huruf di referensi, angka tabelnya rapi untuk nomor agenda. Disajikan sendiri dari paket npm. Dasar 15px, keterangan 14px, judul halaman 28px, angka statistik 32px. Isian selalu 16px agar iOS tidak memperbesar halaman.

## Bentuk dan ukuran

- **Tombol, tab, chip, dan item menu: kapsul** (seperti referensi). **Kartu 16px, dialog 24px, isian 12px**: tidak semua elemen kapsul (R-11).
- Tombol dan isian 40px di layar lebar, 44px di layar sentuh. Kotak centang 18px dengan area ketuk 44px.
- Kartu berbingkai tipis dengan bayangan sangat halus. Bayangan nyata hanya untuk dialog, menu, pesan, dan bilah aksi massal.
- Daftar berada di dalam panel putih: baris atas berisi tab tampilan, cari, dan filter; tabel di layar lebar, daftar ringkas di ponsel; halaman bernomor dan pilihan jumlah baris di bawah.

## Navigasi

- Menu samping putih 256px: nama aplikasi (dan ikon bila admin mengunggahnya), kelompok tanpa judul (Beranda, Surat Masuk, Pekerjaan Saya, Surat Keluar), Telusuri, Pengelolaan. Item aktif kapsul navy, angka perhatian berupa lingkaran kuning. Tombol cepat navy di bawah.
- Bilah atas: kotak cari global berbentuk kapsul, pemberitahuan, pilihan tampilan, dan menu akun berinisial (bukan foto: aplikasi tidak menyimpan foto pegawai).
- Ponsel: bilah bawah empat tujuan; item aktif berlatar kapsul navy kecil.
- Jejak halaman ("Surat Masuk / perihal") di atas judul setiap halaman turunan.

## Daftar data

Setiap daftar punya: tab tampilan, cari, filter (panel), urutan lewat kepala kolom (aria-sort), halaman bernomor dan jumlah baris, ekspor CSV, Excel, dan PDF untuk hasil filter yang sedang dipakai, impor Excel bila datanya dapat dibuat massal (surat masuk, pengguna, unit, instansi, data referensi), dan aksi massal lewat bilah navy di bawah layar. Keadaan daftar tersimpan di alamat.

## Gerak (emil-design-eng)

- Kurva `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`; tidak ada `ease-in` atau `transition: all`.
- Tekan: `scale(0.97)` 160ms (kelas `pressable`), mati bila gerak dikurangi.
- Menu 150ms dari skala 0.97 dengan asal di pemicunya; dialog 200ms masuk, 150ms keluar, berpusat; bilah aksi massal naik 200ms.
- Pratinjau surat diperbarui 700ms setelah berhenti mengetik, tanpa animasi (dipakai terus-menerus saat mengetik).
- Tidak dianimasikan: pindah halaman, tab, sorot baris.

## Keadaan data

Setiap data punya memuat (kerangka dengan kalimat untuk pembaca layar), galat (kotak merah dengan "Muat ulang"), kosong (ikon dalam lingkaran kuning muda, kalimat apa artinya), dan isi.

## Halaman masuk

Terbagi dua seperti referensi, tetapi **tanpa foto orang**: panel navy berisi nama aplikasi, satu kalimat kuning, dan empat hal yang memang dilakukan aplikasi. Foto stok tidak dipakai karena tidak menggambarkan pegawai asli (R-23, R-38).

## Identitas yang dapat diubah admin

Pengaturan > Tampilan aplikasi: nama aplikasi, keterangan singkat, judul tab peramban, deskripsi halaman, dan ikon (PNG/JPG). Tanpa ikon, nama ditulis sebagai teks: tidak ada logo rekaan.
