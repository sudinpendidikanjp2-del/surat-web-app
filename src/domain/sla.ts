/** Tenggat dan indikator waktu. Murni, bisa dipakai di server maupun klien. */

const DAY = 86_400_000;
const toUTC = (iso: string) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export type Prioritas = 'Rendah' | 'Normal' | 'Tinggi' | 'Mendesak';
export type SlaConfig = Record<Prioritas, number>;
export const DEFAULT_SLA: SlaConfig = { Rendah: 5, Normal: 5, Tinggi: 3, Mendesak: 1 };

/** Tambah n hari kerja (Senin sampai Jumat). */
export function addWorkdays(startIso: string, n: number): string {
  let t = toUTC(startIso);
  let left = n;
  while (left > 0) {
    t += DAY;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return iso(t);
}

export const slaDue = (cfg: SlaConfig, prioritas: Prioritas, tglDiterima: string) =>
  addWorkdays(tglDiterima, cfg[prioritas] ?? 5);

export type SlaLevel = 'ok' | 'warn' | 'late' | 'none' | 'selesai';
export interface SlaIndicator { level: SlaLevel; label: string; days: number | null }

/**
 * Aman: sisa lebih dari 2 hari. Mendekati: 0 sampai 2 hari. Terlambat: lewat.
 * done=true berarti pekerjaan selesai, indikator tidak dihitung.
 */
export function slaIndicator(deadlineIso: string | null | undefined, now = new Date(), done = false): SlaIndicator {
  if (!deadlineIso || done) return { level: done ? 'selesai' : 'none', label: done ? 'Selesai' : 'Tanpa batas waktu', days: null };
  const todayMs = toUTC(now.toISOString().slice(0, 10));
  const diff = Math.round((toUTC(deadlineIso) - todayMs) / DAY);
  if (diff < 0) return { level: 'late', label: `Terlambat ${-diff} hari`, days: diff };
  if (diff === 0) return { level: 'warn', label: 'Batas waktu hari ini', days: 0 };
  if (diff <= 2) return { level: 'warn', label: `Sisa ${diff} hari`, days: diff };
  return { level: 'ok', label: `Sisa ${diff} hari`, days: diff };
}

/** Selisih hari kalender dari hari ini ke tanggal ISO (negatif bila lewat). */
export const daysFromToday = (deadline: string, now = new Date()) =>
  Math.round((toUTC(deadline) - toUTC(now.toISOString().slice(0, 10))) / DAY);
