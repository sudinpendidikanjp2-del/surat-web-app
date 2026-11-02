/**
 * Kesalahan bisnis. Lapisan domain dan aplikasi hanya tahu jenis kesalahan; lapisan HTTP yang
 * menerjemahkannya ke kode status. Pesannya ditulis untuk pengguna, dalam bahasa sehari-hari.
 */
export type ErrorKind = 'invalid' | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited' | 'unavailable';

// Penanda global, bukan instanceof: bundler dapat memuat modul ini lebih dari sekali (satu salinan per chunk),
// dan instanceof gagal antar-salinan. Symbol.for selalu mengembalikan simbol yang sama di seluruh proses.
const BRAND = Symbol.for('surat.AppError');

export class AppError extends Error {
  readonly [BRAND] = true;
  constructor(readonly kind: ErrorKind, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export const invalid = (m: string) => new AppError('invalid', m);
export const unauthenticated = (m = 'Sesi berakhir. Silakan masuk kembali') => new AppError('unauthenticated', m);
export const forbidden = (m = 'Anda tidak berwenang melakukan tindakan ini') => new AppError('forbidden', m);
export const notFound = (m = 'Data tidak ditemukan') => new AppError('not_found', m);
export const conflict = (m: string) => new AppError('conflict', m);
export const rateLimited = (m = 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi') => new AppError('rate_limited', m);

export const unavailable = (m: string) => new AppError('unavailable', m);

export const isAppError = (e: unknown): e is AppError => typeof e === 'object' && e !== null && (e as Record<symbol, unknown>)[BRAND] === true;
