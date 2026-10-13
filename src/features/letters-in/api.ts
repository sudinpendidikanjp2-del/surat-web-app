'use client';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api-client';
import type { SlaIndicator } from '@/domain/sla';
import type { LetterInAbilities, Stage, CompletionCheck } from '@/domain/letter-in';

export interface LetterInRow {
  id: number; no_agenda: string; no_surat: string; tgl_surat: string; tgl_diterima: string; asal: string; instansi: string | null;
  perihal: string; sifat: string; prioritas: string; status: string; statusLabel: string; deadline: string | null; sla: SlaIndicator; pic: string | null;
}
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }

export interface DispositionView {
  id: number; parent_id: number | null; from_user_id: number; to_user_id: number | null; to_unit_id: number | null; status: string;
  tindakan: string[]; instruksi: string; deadline: string | null; prioritas: string; accepted_at: string | null; created_at: string;
  return_reason: string | null; dari_nama: string; ke_nama: string | null; ke_unit: string | null;
}
export interface TaskView { id: number; judul: string; status: string; progress: number; deadline: string | null; pic_user_id: number; pic_nama: string }
export interface Attachment { id: number; nama: string; kategori: string; versi: number; ukuran: number; uploader: string | null; created_at: string }
export interface LetterInDetail {
  letter: {
    id: number; no_agenda: string; no_surat: string; tgl_surat: string; tgl_diterima: string; asal: string; instansi: string | null; alamat: string | null;
    perihal: string; jenis: string; sifat: string; prioritas: string; lampiran: string | null; catatan: string | null; status: string; statusLabel: string; creator_nama: string | null;
  };
  dispositions: DispositionView[];
  tasks: TaskView[];
  attachments: Attachment[];
  confirmations: { id: number; tanggal: string; metode: string; pihak: string; hasil: string }[];
  outs: { id: number; no_agenda: string; nomor_surat: string | null; perihal: string; status: string }[];
  stages: Stage[];
  percent: number;
  syarat: { checks: CompletionCheck[]; ok: boolean };
  deadline: string | null;
  sla: SlaIndicator;
  can: LetterInAbilities;
  holds: number[];
}
export interface TimelineEntry { id: number; tipe: string; teks: string; created_at: string; user_nama: string | null }

export const KEYS = ['letter', 'letters-in', 'dashboard', 'timeline', 'dispositions', 'tasks', 'notifications'];

export const useLettersIn = (params: Record<string, string | number>) =>
  useQuery({ queryKey: ['letters-in', params], queryFn: () => api.get<Page<LetterInRow>>(`/letters-in${qs({ pageSize: 20, ...params })}`), placeholderData: (p) => p });

export const useLetterIn = (id: number | string, enabled = true) =>
  useQuery({ queryKey: ['letter', String(id)], queryFn: () => api.get<LetterInDetail>(`/letters-in/${id}`), enabled });

export const useTimeline = (base: string, key: unknown[]) =>
  useQuery({ queryKey: ['timeline', ...key], queryFn: () => api.get<TimelineEntry[]>(`${base}/timeline`) });

export interface UserOption { id: number; username: string; nama: string; jabatan: string | null; role: string; unit_id: number | null; unit_nama: string | null }
export interface UnitOption { id: number; nama: string; kode: string; aktif: boolean; jumlah_pengguna: number }
export const useUserOptions = () => useQuery({ queryKey: ['user-options'], queryFn: () => api.get<UserOption[]>('/users/options'), staleTime: 300_000 });
export const useUnits = () => useQuery({ queryKey: ['units'], queryFn: () => api.get<UnitOption[]>('/units'), staleTime: 300_000 });
