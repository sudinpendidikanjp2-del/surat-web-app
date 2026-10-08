import { one } from './db.js';

const DAY = 86400000;
const toUTC = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Tambah n hari kerja (Senin sampai Jumat) pada tanggal ISO. */
export function addWorkdays(startIso, n) {
  let t = toUTC(startIso);
  let left = n;
  while (left > 0) {
    t += DAY;
    const dow = new Date(t).getUTCDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return iso(t);
}

export async function slaDays() {
  const row = await one(`SELECT value FROM settings WHERE key='sla'`);
  return row?.value || { Rendah: 5, Normal: 5, Tinggi: 3, Mendesak: 1 };
}

export async function slaDueFor(prioritas, tglDiterima) {
  const cfg = await slaDays();
  return addWorkdays(tglDiterima, cfg[prioritas] ?? 5);
}

/**
 * Indikator SLA dari tenggat. Aman: sisa lebih dari 2 hari. Mendekati: 0 sampai 2 hari. Terlambat: lewat.
 * done=true berarti pekerjaan selesai, indikator tidak dihitung.
 */
export function slaIndicator(deadlineIso, now = new Date(), done = false) {
  if (!deadlineIso || done) return { level: done ? 'selesai' : 'none', label: done ? 'Selesai' : 'Tanpa tenggat', days: null };
  const todayMs = toUTC(now.toISOString().slice(0, 10));
  const diff = Math.round((toUTC(deadlineIso) - todayMs) / DAY);
  if (diff < 0) return { level: 'late', label: `Terlambat ${-diff} hari`, days: diff };
  if (diff === 0) return { level: 'warn', label: 'Jatuh tempo hari ini', days: 0 };
  if (diff <= 2) return { level: 'warn', label: `Sisa ${diff} hari`, days: diff };
  return { level: 'ok', label: `Sisa ${diff} hari`, days: diff };
}
