/**
 * Data referensi yang dapat diatur admin. Nilai bawaan dipasang sekali saat kategori masih kosong;
 * nilai yang punya arti khusus bagi sistem (misalnya sifat Rahasia) dikunci: tidak dapat dinonaktifkan atau diganti nama.
 */
import { METODE, SIFAT, TINDAKAN } from './letter-in';
import { METODE_KIRIM } from './letter-out';

export const REF_KATEGORI = {
  jenis_surat: { label: 'Jenis surat', desc: 'Dipakai saat mencatat surat masuk dan menyusun template.', defaults: ['Surat Dinas', 'Undangan', 'Nota Dinas', 'Surat Edaran', 'Surat Keputusan', 'Pemberitahuan', 'Permohonan', 'Laporan'], locked: [] as string[] },
  sifat: { label: 'Sifat surat', desc: 'Surat bersifat Rahasia hanya terlihat oleh yang berhak dan pelacakannya mati.', defaults: [...SIFAT], locked: ['Biasa', 'Rahasia'] },
  tindakan: { label: 'Tindakan disposisi', desc: 'Pilihan yang dicentang pimpinan saat memberi disposisi.', defaults: [...TINDAKAN], locked: [] as string[] },
  metode_konfirmasi: { label: 'Cara mengabari pengirim', desc: 'Dipakai saat mencatat kabar ke pengirim surat masuk.', defaults: [...METODE], locked: [] as string[] },
  metode_kirim: { label: 'Cara pengiriman surat keluar', desc: 'Dipakai saat mencatat surat keluar yang sudah dikirim.', defaults: [...METODE_KIRIM], locked: [] as string[] },
} as const;

export type RefKategori = keyof typeof REF_KATEGORI;
export const REF_KEYS = Object.keys(REF_KATEGORI) as RefKategori[];
export const isRefKategori = (k: string): k is RefKategori => k in REF_KATEGORI;
export const isLockedRef = (k: RefKategori, nilai: string) => (REF_KATEGORI[k].locked as readonly string[]).includes(nilai);

export interface RefItem { id: number; kategori: RefKategori; nilai: string; keterangan: string | null; urutan: number; aktif: boolean }
export interface Instansi { id: number; nama: string; singkatan: string | null; alamat: string | null; telepon: string | null; email: string | null; aktif: boolean; jumlah_surat?: number }
