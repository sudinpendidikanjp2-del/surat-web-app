export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const parts = (iso: string) => String(iso).slice(0, 10).split('-').map(Number);

/** 12 Oktober 2026 */
export function tanggalIndo(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = parts(iso);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** Senin, 12 Oktober 2026 */
export function hariTanggalIndo(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = parts(iso);
  return `${HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${BULAN[m - 1]} ${y}`;
}
