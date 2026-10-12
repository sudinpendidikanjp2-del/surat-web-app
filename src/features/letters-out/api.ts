'use client';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api-client';
import type { LetterOutAbilities, TemplateField } from '@/domain/letter-out';
import type { Page } from '@/features/letters-in/api';

export interface LetterOutRow { id: number; no_agenda: string; nomor_surat: string | null; jenis: string; perihal: string; tujuan: string; status: string; statusLabel: string; tgl_surat: string; pembuat: string; asal_agenda: string | null }
export interface LetterOutDetail {
  letter: { id: number; no_agenda: string; nomor_surat: string | null; jenis: string; perihal: string; tujuan: string; status: string; statusLabel: string; tgl_surat: string; pembuat: string; letter_in_id: number | null; template_version_id: number; penandatangan_id: number | null; fields: Record<string, string> };
  template: { id: number; nama: string; versi: number; fields: TemplateField[] };
  signer: { id: number; nama: string; jabatan: string | null } | null;
  approvals: { id: number; aksi: string; catatan: string | null; created_at: string; user_nama: string }[];
  attachments: { id: number; nama: string; kategori: string; versi: number; ukuran: number; uploader: string | null; created_at: string }[];
  asal: { id: number; no_agenda: string; perihal: string } | null;
  can: LetterOutAbilities;
  kurang: string[];
}
export interface TemplateRow { id: number; nama: string; kode: string; jenis: string; deskripsi: string | null; aktif: boolean; versi_aktif_id: number | null; versi_aktif: number | null; jumlah_versi: number }
export interface TemplateDetail { template: TemplateRow & { kode_klasifikasi: string | null }; versions: { id: number; versi: number; catatan: string | null; aktif: boolean; created_at: string; dibuat_oleh: string | null; fields: TemplateField[] }[] }

export const KEYS = ['letter-out', 'letters-out', 'dashboard', 'letter', 'timeline', 'letters-in'];

export const useLettersOut = (params: Record<string, string | number>) =>
  useQuery({ queryKey: ['letters-out', params], queryFn: () => api.get<Page<LetterOutRow>>(`/letters-out${qs({ pageSize: 10, ...params })}`), placeholderData: (p) => p });
export const useLetterOut = (id: string) => useQuery({ queryKey: ['letter-out', id], queryFn: () => api.get<LetterOutDetail>(`/letters-out/${id}`) });
export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api.get<TemplateRow[]>('/templates') });
export const useTemplate = (id: string | number | null) => useQuery({ queryKey: ['template', String(id)], queryFn: () => api.get<TemplateDetail>(`/templates/${id}`), enabled: Boolean(id) });
