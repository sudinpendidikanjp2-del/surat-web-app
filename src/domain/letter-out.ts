import type { Actor } from './roles';
import { can, is } from './roles';
import { RICH_MAX, richIsEmpty } from './rich-text';

export const STATUS_OUT = {
  DRAFT: 'Draf',
  REVIEW: 'Sedang diperiksa',
  REVISI: 'Perlu diperbaiki',
  MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan pimpinan',
  DISETUJUI: 'Disetujui',
  NOMOR_DIBERIKAN: 'Sudah bernomor, menunggu tanda tangan',
  DITANDATANGANI: 'Sudah ditandatangani, siap dikirim',
  DIKIRIM: 'Sudah dikirim',
  SELESAI: 'Selesai',
  DITOLAK: 'Ditolak',
} as const;
export type StatusOut = keyof typeof STATUS_OUT;

export const METODE_KIRIM = ['Surat resmi', 'Email', 'WhatsApp', 'Tatap muka', 'Sistem/aplikasi', 'Lainnya'] as const;
export const PLACEHOLDER_NOMOR = '[nomor diberikan setelah disetujui]';

/** Field yang diisi dari kolom bawaan formulir, bukan dari daftar field template. */
export const BAWAAN = new Set(['perihal', 'hal', 'nama_penerima', 'kepada', 'tanggal']);

export interface TemplateField { name: string; label: string; type: 'text' | 'textarea' | 'rich' | 'date'; required: boolean; sistem?: boolean; bawaan?: boolean }
export const withBawaan = (fields: TemplateField[]) => fields.map((f) => ({ ...f, bawaan: BAWAAN.has(f.name) }));

export interface LetterOut {
  id: number;
  no_agenda: string;
  letter_in_id: number | null;
  template_version_id: number;
  jenis: string;
  perihal: string;
  tujuan: string;
  fields: Record<string, string>;
  status: StatusOut;
  nomor_surat: string | null;
  tgl_surat: string;
  penandatangan_id: number | null;
  created_by: number;
}

const owner = (user: Actor, lo: Pick<LetterOut, 'created_by'>) => lo.created_by === user.id || is(user, 'superadmin', 'tu');

export const canEditOut = (user: Actor, lo: Pick<LetterOut, 'status' | 'created_by'>) =>
  (['DRAFT', 'REVISI'].includes(lo.status) && owner(user, lo)) || (lo.status === 'REVIEW' && can.review(user));

export function letterOutAbilities(user: Actor, lo: Pick<LetterOut, 'status' | 'created_by'>) {
  const mine = owner(user, lo);
  const draft = ['DRAFT', 'REVISI'].includes(lo.status);
  return {
    edit: canEditOut(user, lo),
    ajukanReview: draft && mine,
    ajukan: (draft && mine) || (lo.status === 'REVIEW' && can.review(user)),
    review: lo.status === 'REVIEW' && can.review(user),
    putuskan: lo.status === 'MENUNGGU_PERSETUJUAN' && can.approve(user),
    ttd: lo.status === 'NOMOR_DIBERIKAN' && (is(user, 'superadmin', 'tu') || lo.created_by === user.id),
    kirim: lo.status === 'DITANDATANGANI' && is(user, 'superadmin', 'tu'),
    selesai: lo.status === 'DIKIRIM' && is(user, 'superadmin', 'tu'),
    komentar: !is(user, 'viewer'),
    unggah: !is(user, 'viewer') && !['SELESAI', 'DITOLAK'].includes(lo.status),
  };
}
export type LetterOutAbilities = ReturnType<typeof letterOutAbilities>;

export const isOwnerOut = owner;

/** Ambil nilai field dari masukan, hanya untuk field isian (bukan sistem, bukan bawaan). */
export function cleanFields(fields: TemplateField[], input: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.sistem || BAWAAN.has(f.name)) continue;
    const v = input?.[f.name];
    out[f.name] = v == null ? '' : String(v).slice(0, f.type === 'rich' ? RICH_MAX : 4000);
  }
  return out;
}

export const missingRequired = (fields: TemplateField[], values: Record<string, string>) =>
  fields.filter((f) => f.required && !f.sistem && !BAWAAN.has(f.name) && richIsEmpty(values[f.name])).map((f) => f.label);

export const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export interface NumberingConfig { format: string; kode_default: string; digits: number }
export const DEFAULT_NUMBERING: NumberingConfig = { format: '{kode}/{urut}/{unit}/{bulan_romawi}/{tahun}', kode_default: '000', digits: 3 };

/** Susun nomor surat dari pola. Urutan (urut) diberikan oleh penyedia urutan atomik. */
export function formatNomor(cfg: NumberingConfig, p: { kode: string | null; urut: number; unit: string; tglSurat: string }) {
  const year = p.tglSurat.slice(0, 4);
  const month = Number(p.tglSurat.slice(5, 7));
  return cfg.format
    .replaceAll('{kode}', p.kode || cfg.kode_default)
    .replaceAll('{urut}', String(p.urut).padStart(cfg.digits, '0'))
    .replaceAll('{unit}', p.unit || '')
    .replaceAll('{bulan_romawi}', ROMAWI[month - 1])
    .replaceAll('{bulan}', String(month).padStart(2, '0'))
    .replaceAll('{tahun}', year);
}

export const outAgenda = (year: string, seq: number) => `SK-${year}-${String(seq).padStart(6, '0')}`;
