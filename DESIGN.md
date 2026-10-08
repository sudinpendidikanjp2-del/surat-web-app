# DESIGN.md

Arah desain aplikasi Sistem Surat dan Disposisi. Sumber arah: skill apple-design (respons instan, gerak berbasis pegas yang dapat diinterupsi, material translusen, tipografi optik, kesederhanaan). antislop dipakai sebagai filter, bukan sumber gaya.

Design Read: sistem kerja internal instansi untuk TU, pimpinan, dan pegawai, bahasa visual Apple, dial ENERGY 1 / RHYTHM 2 / MOTION 2.

## Identitas

- Alasan dial: ini alat kerja harian. Energi rendah agar angka dan tenggat yang menonjol, bukan dekorasi. Ritme 2 karena dasbor, daftar, dan detail memang berbeda komposisi. Gerak 2: pegas pada panel, bilah progres, dan menu; selain itu hanya umpan balik tekan.
- Motif identitas: **stempel agenda** (nomor agenda dalam kotak bergaris miring tipis, seperti cap penerimaan surat) dan **benang** (garis waktu vertikal yang menghubungkan satu urusan dari surat masuk sampai arsip). Keduanya muncul berulang dan hanya di tempat yang artinya sama.
- Fokus per layar: dasbor menonjolkan angka "surat masuk tahun ini" dan pusat perhatian; detail surat menonjolkan judul perihal lalu bilah progres.

## Warna

Netral hangat (kertas) ditambah satu aksen hijau tinta `#0b6b57`. Hijau dipilih karena nuansa dokumen resmi dan tidak berbagi palet dengan gradien biru-ungu bawaan. Warna status (hijau, kuning, merah) dipakai hanya untuk SLA dan status karena PRD mewajibkan indikator tiga warna; selalu disertai teks.

- Terang: latar `#f5f3ee`, permukaan `#ffffff`, tinta `#1c1b19`.
- Gelap: latar `#121412`, permukaan `#1b1d1b`, aksen `#3bb89a`.
- Semua pasangan teks diperiksa minimal 4.5:1 (hasil 5.47 sampai 16.1 di terang dan gelap).
- Tema terang dan gelap sama-sama berfungsi, mengikuti sistem sampai pengguna menekan tombol tema.

## Tipografi

`system-ui` (San Francisco di perangkat Apple, Segoe UI di Windows). Alasan: font sistem sudah membawa ukuran optik dan tabel tracking, dan tidak ada unduhan.
Pelacakan ukuran-spesifik: judul besar `-0.022em`, judul kecil `-0.006em`, isi `0`, teks kecil `+0.005em`. Angka memakai `tabular-nums`.

## Bentuk

Radius berjenjang: kontrol 8px, kartu 14px, panel 20px, penanda status 6px. Tidak ada elemen berbentuk kapsul. Bayangan hanya untuk kartu (ringan) dan panel (elevasi nyata).

## Material

`backdrop-filter` hanya pada dua tempat: bilah atas yang tetap (konten bergulir di bawahnya) dan scrim di belakang panel. Sidebar sengaja solid. `prefers-reduced-transparency` membuat keduanya solid.

## Gerak

- Panel (Sheet): pegas critically damped (bounce 0, 0.42 dtk). Di desktop masuk dan keluar dari kanan (jalur simetris). Di ponsel naik dari bawah, dapat diseret mengikuti jari 1:1, kecepatan lepas dibawa ke pegas, tujuan dipilih dari proyeksi momentum, tarikan ke atas diredam (rubber band).
- Tekan: `scale(0.97)` seketika pada `:active`.
- Bilah progres: pegas dari 0 ke nilai.
- `prefers-reduced-motion`: pegas diganti perpindahan langsung.

## Interaksi dan akses

Semua kontrol dapat dioperasikan keyboard, fokus terlihat (`:focus-visible`), panel mengunci fokus dan menutup dengan Escape, tautan "lewati ke konten". Target sentuh 44px di bawah 900px. Tabel menjadi daftar kartu di ponsel.

## Yang sengaja tidak dibuat

Ikon pustaka (hanya enam glif yang artinya jelas), logo (nama teks, tunggu logo asli dari instansi), foto atau avatar, statistik contoh, testimoni, FAQ.
