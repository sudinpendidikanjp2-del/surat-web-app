import { BULAN } from '@/domain/calendar';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** 12 Oktober 2026 (nama bulan ditulis lengkap: lebih mudah dibaca daripada singkatan). */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** Senin, 12 Oktober 2026 */
export function fmtDateLong(date = new Date()) {
  return `${HARI[date.getDay()]}, ${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

/** 12 Oktober 2026, pukul 09.30 */
export function fmtDateTime(ts: string | null | undefined) {
  if (!ts) return '-';
  const d = new Date(ts);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}, pukul ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoDate(new Date());
export const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); };

export const fmtSize = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}
