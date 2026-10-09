# DESIGN.md

Arah desain aplikasi Sistem Surat dan Disposisi. Sumber arah gerak dan kerajinan antarmuka: skill emil-design-eng (Emil Kowalski), terpasang di `.agents/skills`. antislop dipakai sebagai filter, bukan sumber gaya. Skill apple-design tidak lagi dipakai.

Design Read: sistem kerja internal instansi untuk TU, pimpinan, dan pegawai, bahasa visual tenang dan padat fungsi, dial ENERGY 1 / RHYTHM 2 / MOTION 2.

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

`backdrop-filter` hanya pada bilah atas yang tetap, scrim di belakang panel, dan dialog. Sidebar sengaja solid. `prefers-reduced-transparency` membuat semuanya solid.

## Gerak (aturan emil-design-eng)

Frekuensi menentukan: tindakan yang dilakukan puluhan kali sehari tidak dianimasikan.

- Kurva: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` untuk masuk dan umpan balik, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)` untuk sidebar. Tidak ada `ease-in`, tidak ada `transition: all`.
- Durasi: tekan 160 ms, menu dan popover 150 ms, dialog 180 ms, bilah aksi massal 200 ms, panel 300 ms masuk dan 220 ms keluar (keluar lebih cepat karena sistem merespons). Tidak ada yang melewati 300 ms kecuali bilah progres (500 ms, jarang terlihat).
- Tekan: `scale(0.97)` seketika pada `:active` untuk tombol, chip, tab, tombol halaman.
- Tidak ada animasi dari `scale(0)`. Popover mulai dari `scale(0.97)` dengan `transform-origin` di pemicunya (kanan atas atau kiri atas), dialog tetap berpusat.
- Tindakan keyboard tidak dianimasikan: Escape menutup panel seketika, menu yang dibuka dengan Enter atau Spasi tampil tanpa transisi.
- Panel (Sheet): pegas critically damped. Di desktop masuk dan keluar dari kanan (jalur simetris). Di ponsel naik dari bawah, dapat diseret mengikuti jari 1:1, kecepatan lepas dibawa ke pegas, tujuan dipilih dari proyeksi momentum, tarikan ke atas diredam. Satu jari saja yang dihitung (pointer capture).
- Efek `:hover` hanya pada `(hover: hover) and (pointer: fine)`.
- Masuk memakai `@starting-style` dan transisi CSS (dapat diinterupsi), bukan keyframe.
- `prefers-reduced-motion`: pegas diganti perpindahan langsung, sisanya hanya memudar.

## Tata letak dan alur (agar tidak membingungkan)

- Satu tombol utama per layar. Halaman detail surat membuka dengan kartu "Langkah berikutnya" yang menyebut apa yang perlu Anda lakukan sekarang dan memberi tepat satu tombol utama; sisanya masuk menu "Aksi lain".
- Panel status di sisi kanan menjawab tiga pertanyaan PRD: surat ada di mana (Posisi), kapan harus selesai (Tenggat), sudah sampai mana (Progres).
- Beranda dibuka dengan "Perlu tindakan Anda", daftar pekerjaan yang menunggu pengguna itu, masing-masing dengan satu tombol. Angka ringkasan ada di bawahnya.
- Semua daftar data memakai satu pola: tab cepat, kotak cari, saringan (popover) dengan chip aktif yang dapat dihapus, tabel yang dapat diurutkan, pilih baris, bilah aksi massal, halaman. Status daftar tersimpan di URL sehingga tombol kembali dan tautan tetap bermakna.
- Aksi massal selalu meminta konfirmasi bila tidak dapat diurungkan, berjalan per data (satu gagal tidak menggagalkan yang lain), dan melaporkan rincian kegagalan.
- Urutan tombol di panel dan dialog selalu: Batal di kiri, tindakan utama di kanan, tindakan merusak berwarna merah dan terpisah.

## Interaksi dan akses

Semua kontrol dapat dioperasikan keyboard, fokus terlihat (`:focus-visible`), panel mengunci fokus dan menutup dengan Escape, tautan "lewati ke konten". Target sentuh 44px di bawah 900px. Tabel menjadi daftar kartu di ponsel.

## Yang sengaja tidak dibuat

Ikon pustaka (hanya beberapa glif yang artinya jelas), logo (nama teks, tunggu logo asli dari instansi), foto atau avatar, statistik contoh, testimoni, FAQ.
