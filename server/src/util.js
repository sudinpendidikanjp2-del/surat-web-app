export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const bad = (m) => new HttpError(400, m);
export const forbidden = (m = 'Anda tidak berwenang melakukan tindakan ini') => new HttpError(403, m);
export const notFound = (m = 'Data tidak ditemukan') => new HttpError(404, m);
export const conflict = (m) => new HttpError(409, m);

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function str(v, name, { max = 2000, required = true } = {}) {
  const s = v == null ? '' : String(v).trim();
  if (!s) {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  if (s.length > max) throw bad(`${name} terlalu panjang (maks ${max} karakter)`);
  return s;
}

export function oneOf(v, list, name, { required = true } = {}) {
  if (v == null || v === '') {
    if (required) throw bad(`${name} wajib dipilih`);
    return null;
  }
  if (!list.includes(v)) throw bad(`${name} tidak valid`);
  return v;
}

export function dateStr(v, name, { required = true } = {}) {
  if (v == null || v === '') {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw bad(`${name} harus berformat tanggal yang valid`);
  return v;
}

export function int(v, name, { required = true, min = -Infinity, max = Infinity } = {}) {
  if (v == null || v === '') {
    if (required) throw bad(`${name} wajib diisi`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} tidak valid`);
  return n;
}

export const today = () => new Date().toISOString().slice(0, 10);

export const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
export const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export function tanggalIndo(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
export function hariTanggalIndo(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${HARI[dow]}, ${d} ${BULAN[m - 1]} ${y}`;
}
