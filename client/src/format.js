const tgl = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const tglPanjang = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const waktu = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

export const fmtDate = (iso) => (iso ? tgl.format(new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)) : '-');
export const fmtDateLong = (d = new Date()) => tglPanjang.format(d);
export const fmtDateTime = (ts) => (ts ? waktu.format(new Date(ts)).replace(/\./g, ':') : '-');
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const plusDays = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const greeting = () => {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
};

export const STATUS_IN = {
  DITERIMA: ['Diterima', 'neutral'],
  MENUNGGU_DISPOSISI: ['Menunggu disposisi', 'warn'],
  DIDISPOSISIKAN: ['Didisposisikan', 'accent'],
  SEDANG_DIPROSES: ['Sedang diproses', 'accent'],
  MENUNGGU_KONFIRMASI: ['Menunggu konfirmasi', 'warn'],
  MENUNGGU_PERSETUJUAN: ['Menunggu persetujuan', 'warn'],
  SELESAI: ['Selesai', 'ok'],
  DIARSIPKAN: ['Diarsipkan', 'neutral'],
};
export const STATUS_OUT = {
  DRAFT: ['Draft', 'neutral'], REVIEW: ['Review', 'warn'], REVISI: ['Revisi', 'warn'], MENUNGGU_PERSETUJUAN: ['Menunggu persetujuan', 'warn'],
  DISETUJUI: ['Disetujui', 'accent'], NOMOR_DIBERIKAN: ['Nomor diberikan', 'accent'], DITANDATANGANI: ['Ditandatangani', 'accent'],
  DIKIRIM: ['Dikirim', 'ok'], SELESAI: ['Selesai', 'ok'], DITOLAK: ['Ditolak', 'late'],
};
export const STATUS_TASK = {
  BELUM_DIMULAI: ['Belum dimulai', 'neutral'], DITERIMA: ['Diterima', 'neutral'], DIPROSES: ['Sedang diproses', 'accent'],
  MENUNGGU_DATA: ['Menunggu data', 'warn'], MENUNGGU_KONFIRMASI: ['Menunggu konfirmasi', 'warn'], MENUNGGU_PERSETUJUAN: ['Menunggu persetujuan', 'warn'],
  SELESAI: ['Selesai', 'ok'], DIBATALKAN: ['Dibatalkan', 'neutral'],
};
export const STATUS_DISP = { BARU: ['Menunggu diterima', 'warn'], DITERIMA: ['Diterima', 'accent'], DITERUSKAN: ['Diteruskan', 'neutral'], DIKEMBALIKAN: ['Dikembalikan', 'late'], SELESAI: ['Selesai', 'ok'] };

export const ROLE_LABEL = { superadmin: 'Super Admin', tu: 'Tata Usaha', pimpinan: 'Pimpinan', pejabat: 'Pejabat / Koordinator', pelaksana: 'Pelaksana', viewer: 'Viewer' };
export const TINDAKAN = ['Untuk diketahui', 'Untuk ditindaklanjuti', 'Untuk dikoordinasikan', 'Untuk disiapkan jawaban', 'Untuk dibuatkan surat', 'Untuk dilaporkan kembali'];
export const SIFAT = ['Biasa', 'Segera', 'Penting', 'Rahasia'];
export const PRIORITAS = ['Rendah', 'Normal', 'Tinggi', 'Mendesak'];
export const METODE = ['Surat resmi', 'Email', 'WhatsApp', 'Telepon', 'Tatap muka', 'Sistem/aplikasi', 'Lainnya'];
