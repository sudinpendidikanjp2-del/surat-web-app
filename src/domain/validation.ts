import { invalid } from './errors';

/** Pemeriksa masukan. Semua melempar AppError('invalid') dengan pesan yang menyebut nama isian. */

interface Opt { required?: boolean }

export function str(v: unknown, name: string, opts: { max?: number; required: false }): string | null;
export function str(v: unknown, name: string, opts?: { max?: number; required?: true }): string;
export function str(v: unknown, name: string, { max = 2000, required = true }: { max?: number; required?: boolean } = {}): string | null {
  const s = v == null ? '' : String(v).trim();
  if (!s) {
    if (required) throw invalid(`${name} wajib diisi`);
    return null;
  }
  if (s.length > max) throw invalid(`${name} terlalu panjang (maks ${max} karakter)`);
  return s;
}

export function oneOf<T extends string>(v: unknown, list: readonly T[], name: string, opts: { required: false }): T | null;
export function oneOf<T extends string>(v: unknown, list: readonly T[], name: string, opts?: { required?: true }): T;
export function oneOf<T extends string>(v: unknown, list: readonly T[], name: string, { required = true }: Opt = {}): T | null {
  if (v == null || v === '') {
    if (required) throw invalid(`${name} wajib dipilih`);
    return null;
  }
  if (!list.includes(v as T)) throw invalid(`${name} tidak valid`);
  return v as T;
}

export function dateStr(v: unknown, name: string, opts: { required: false }): string | null;
export function dateStr(v: unknown, name: string, opts?: { required?: true }): string;
export function dateStr(v: unknown, name: string, { required = true }: Opt = {}): string | null {
  if (v == null || v === '') {
    if (required) throw invalid(`${name} wajib diisi`);
    return null;
  }
  const s = String(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw invalid(`${name} harus berformat tanggal yang valid`);
  return s;
}

interface IntOpt { required?: boolean; min?: number; max?: number }
export function int(v: unknown, name: string, opts: IntOpt & { required: false }): number | null;
export function int(v: unknown, name: string, opts?: IntOpt & { required?: true }): number;
export function int(v: unknown, name: string, { required = true, min = -Infinity, max = Infinity }: IntOpt = {}): number | null {
  if (v == null || v === '') {
    if (required) throw invalid(`${name} wajib diisi`);
    return null;
  }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${name} tidak valid`);
  return n;
}

/** Daftar dipisah koma dari parameter kueri, maks 12 butir. */
export const csvList = (v: unknown): string[] =>
  v ? String(v).split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12) : [];

export const today = () => new Date().toISOString().slice(0, 10);
