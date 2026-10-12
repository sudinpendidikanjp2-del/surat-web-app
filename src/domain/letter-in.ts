import type { Actor } from './roles';
import { can, is } from './roles';
import { slaIndicator, type Prioritas } from './sla';

/** Surat masuk adalah satu urusan (case): disposisi, tugas, dokumen, dan balasan menempel padanya. */

export const STATUS_IN = {
  DITERIMA: 'Baru diterima',
  MENUNGGU_DISPOSISI: 'Menunggu disposisi pimpinan',
  DIDISPOSISIKAN: 'Sudah didisposisikan',
  SEDANG_DIPROSES: 'Sedang dikerjakan',
  MENUNGGU_KONFIRMASI: 'Menunggu konfirmasi ke pengirim',
  MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan balasan',
  SELESAI: 'Selesai',
  DIARSIPKAN: 'Sudah diarsipkan',
} as const;
export type StatusIn = keyof typeof STATUS_IN;

export const SIFAT = ['Biasa', 'Segera', 'Penting', 'Rahasia'] as const;
export type Sifat = (typeof SIFAT)[number];
export const PRIORITAS = ['Rendah', 'Normal', 'Tinggi', 'Mendesak'] as const satisfies readonly Prioritas[];
export const PRIORITAS_DISPOSISI = ['Normal', 'Tinggi', 'Mendesak'] as const;
export const TINDAKAN = [
  'Untuk diketahui', 'Untuk ditindaklanjuti', 'Untuk dikoordinasikan',
  'Untuk disiapkan jawaban', 'Untuk dibuatkan surat', 'Untuk dilaporkan kembali',
] as const;
export const METODE = ['Surat resmi', 'Email', 'WhatsApp', 'Telepon', 'Tatap muka', 'Sistem/aplikasi', 'Lainnya'] as const;
export const KATEGORI_IN = ['SURAT', 'PENDUKUNG', 'HASIL', 'DRAF', 'FINAL', 'BUKTI', 'TTD', 'DISPOSISI'] as const;
export type KategoriDokumen = (typeof KATEGORI_IN)[number];

export const FINISHED_IN: StatusIn[] = ['SELESAI', 'DIARSIPKAN'];
export const isFinished = (status: string) => FINISHED_IN.includes(status as StatusIn);

export const STATUS_DISP = {
  BARU: 'Menunggu diterima',
  DITERIMA: 'Sudah diterima',
  DITERUSKAN: 'Diteruskan',
  DIKEMBALIKAN: 'Dikembalikan',
  SELESAI: 'Selesai',
} as const;
export type StatusDisp = keyof typeof STATUS_DISP;

export interface LetterIn {
  id: number;
  no_agenda: string;
  case_no: string;
  no_surat: string;
  tgl_surat: string;
  tgl_diterima: string;
  asal: string;
  instansi: string | null;
  alamat: string | null;
  perihal: string;
  jenis: string;
  sifat: Sifat;
  prioritas: Prioritas;
  lampiran: string | null;
  catatan: string | null;
  status: StatusIn;
  sla_due: string | null;
  qr_token: string;
  created_by: number;
  diteruskan_at: string | null;
  selesai_at: string | null;
  track_code: string;
  track_enabled: boolean;
}

export interface Disposition {
  id: number;
  letter_in_id: number;
  parent_id: number | null;
  from_user_id: number;
  to_user_id: number | null;
  to_unit_id: number | null;
  tindakan: string[];
  instruksi: string;
  deadline: string | null;
  prioritas: string;
  status: StatusDisp;
  accepted_at: string | null;
}

/** Penerima disposisi aktif: langsung, atau pejabat dari unit tujuan. */
export function holdsDisposition(user: Actor, d: Pick<Disposition, 'status' | 'to_user_id' | 'to_unit_id'>): boolean {
  if (d.status === 'DIKEMBALIKAN') return false;
  if (d.to_user_id === user.id) return true;
  return Boolean(d.to_unit_id && d.to_unit_id === user.unit_id && is(user, 'pejabat'));
}

/**
 * Status surat dihitung dari keadaan nyata. Status akhir (selesai, arsip) dan fase sebelum
 * ada disposisi tidak diubah.
 */
export function deriveStatus(current: StatusIn, facts: {
  dispositions: { status: string; accepted_at: string | null }[];
  tasks: { status: string }[];
  outs: { status: string }[];
}): StatusIn {
  if (isFinished(current) || facts.dispositions.length === 0) return current;
  const active = facts.dispositions.filter((d) => d.status !== 'DIKEMBALIKAN');
  if (active.length === 0) return 'MENUNGGU_DISPOSISI';
  if (!active.some((d) => d.accepted_at)) return 'DIDISPOSISIKAN';
  const tasks = facts.tasks.filter((t) => t.status !== 'DIBATALKAN');
  if (facts.outs.some((o) => ['REVIEW', 'MENUNGGU_PERSETUJUAN'].includes(o.status))) return 'MENUNGGU_PERSETUJUAN';
  const allDone = tasks.length > 0 && tasks.every((t) => t.status === 'SELESAI');
  if (allDone || tasks.some((t) => t.status === 'MENUNGGU_KONFIRMASI')) return 'MENUNGGU_KONFIRMASI';
  return 'SEDANG_DIPROSES';
}

export interface StageCounts { disp: number; accepted: number; tasks: number; tasks_open: number; tasks_started: number; conf: number }
export interface Stage { key: string; label: string; done: boolean }

/** Tahapan progres. Persen = tahap selesai dibagi jumlah tahap. */
export function stagesFor(letter: Pick<LetterIn, 'status' | 'diteruskan_at'>, c: StageCounts): { stages: Stage[]; percent: number } {
  const done = isFinished(letter.status);
  const stages: Stage[] = [
    { key: 'diterima', label: 'Diterima Tata Usaha', done: true },
    { key: 'diteruskan', label: 'Diteruskan kepada pimpinan', done: Boolean(letter.diteruskan_at) || c.disp > 0 },
    { key: 'disposisi', label: 'Didisposisikan', done: c.disp > 0 },
    { key: 'diterima_pelaksana', label: 'Diterima pelaksana', done: c.accepted > 0 },
    { key: 'diproses', label: 'Dikerjakan', done: c.tasks_started > 0 || done },
    { key: 'tindak_lanjut', label: 'Pekerjaan selesai', done: (c.tasks > 0 && c.tasks_open === 0) || done },
    { key: 'konfirmasi', label: 'Pengirim sudah dikabari', done: c.conf > 0 },
    { key: 'selesai', label: 'Selesai', done },
  ];
  return { stages, percent: Math.round((stages.filter((s) => s.done).length / stages.length) * 100) };
}

export interface CompletionCheck { ok: boolean; label: string }

/** Syarat sebuah surat boleh dinyatakan selesai. */
export function completionChecks(tasks: { status: string }[], outs: { no_agenda: string; status: string }[], confirmations: number) {
  const open = tasks.filter((t) => t.status !== 'DIBATALKAN' && t.status !== 'SELESAI').length;
  const openOuts = outs.filter((o) => !['DIKIRIM', 'SELESAI'].includes(o.status));
  const live = tasks.filter((t) => t.status !== 'DIBATALKAN');
  const checks: CompletionCheck[] = [
    { ok: open === 0, label: open ? `Semua tugas selesai (${open} tugas belum selesai)` : live.length ? 'Semua tugas selesai' : 'Tidak ada tugas terbuka' },
    { ok: openOuts.length === 0, label: openOuts.length ? `Surat balasan sudah dikirim (${openOuts.map((o) => o.no_agenda).join(', ')} belum)` : outs.length ? 'Surat balasan sudah dikirim' : 'Tidak ada surat balasan yang tertunda' },
    { ok: confirmations > 0, label: 'Pengirim surat sudah dikabari (konfirmasi dicatat)' },
  ];
  return { checks, ok: checks.every((c) => c.ok) };
}

/** Tenggat efektif: batas disposisi aktif terdekat, atau SLA bila belum ada. */
export function effectiveDeadline(letter: Pick<LetterIn, 'sla_due'>, dispDeadlines: (string | null)[] = []) {
  return dispDeadlines.filter((d): d is string => Boolean(d)).sort()[0] || letter.sla_due || null;
}

export const indicatorFor = (letter: Pick<LetterIn, 'status'>, deadline: string | null) =>
  slaIndicator(deadline, new Date(), isFinished(letter.status));

/** Tindakan yang tersedia untuk pengguna ini pada surat ini. */
export function letterInAbilities(user: Actor, letter: Pick<LetterIn, 'status'>, holds: Disposition[], tasks: { pic_user_id: number }[]) {
  const finished = isFinished(letter.status);
  const viewer = is(user, 'viewer');
  return {
    edit: can.manageIn(user) && ['DITERIMA', 'MENUNGGU_DISPOSISI'].includes(letter.status),
    forward: can.manageIn(user) && letter.status === 'DITERIMA',
    disposisi: !finished && (can.dispose(user) || holds.length > 0),
    terima: holds.some((d) => d.status === 'BARU'),
    tugaskan: !finished && can.assign(user) && (is(user, 'superadmin', 'pimpinan') || holds.length > 0),
    balas: !finished && !viewer && (can.manageIn(user) || is(user, 'pejabat', 'pelaksana') || can.dispose(user)),
    upload: !finished && !viewer,
    komentar: !viewer,
    konfirmasi: !finished && !viewer && (!is(user, 'pelaksana') || tasks.some((t) => t.pic_user_id === user.id)),
    selesaikan: !finished && is(user, 'superadmin', 'tu', 'pimpinan', 'pejabat'),
    arsipkan: letter.status === 'SELESAI' && can.manageIn(user),
    cetak: can.manageIn(user) || can.dispose(user) || holds.length > 0,
    lacak: is(user, 'superadmin', 'tu', 'pimpinan'),
    aturLacak: is(user, 'superadmin', 'tu'),
  };
}
export type LetterInAbilities = ReturnType<typeof letterInAbilities>;

/** Nomor agenda dan nomor urusan dari urutan tahunan. */
export const agendaNumbers = (year: string, seq: number) => ({
  no_agenda: `SM-${year}-${String(seq).padStart(6, '0')}`,
  case_no: `CASE-${year}-${String(seq).padStart(6, '0')}`,
});
