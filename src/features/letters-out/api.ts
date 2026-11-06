'use client';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api-client';
import type { LetterOutAbilities } from '@/domain/letter-out';
import type { Page } from '@/features/letters-in/api';

export interface LetterOutRow { id: number; no_agenda: string; nomor_surat: string | null; jenis: string; perihal: string; tujuan: string; status: string; statusLabel: string; tgl_surat: string; pembuat: string; asal_agenda: string | null }
export interface LetterOutDetail {
  letter: {
    id: number; no_agenda: string; nomor_surat: string | null; jenis: string; sifat: string; perihal: string; tujuan: string; lampiran: string | null; catatan: string | null;
    status: string; statusLabel: string; tgl_surat: string; pembuat: string; letter_in_id: number | null; penandatangan_id: number | null;
    sent_at: string | null; sent_method: string | null; batal_alasan: string | null;
  };
  signer: { id: number; nama: string; jabatan: string | null } | null;
  /** Riwayat persetujuan dari versi lama aplikasi; kosong untuk surat yang dicatat sekarang. */
  approvals: { id: number; aksi: string; catatan: string | null; created_at: string; user_nama: string }[];
  attachments: { id: number; nama: string; kategori: string; versi: number; ukuran: number; uploader: string | null; created_at: string }[];
  asal: { id: number; no_agenda: string; perihal: string } | null;
  can: LetterOutAbilities;
  signed: boolean;
}

export const KEYS = ['letter-out', 'letters-out', 'dashboard', 'letter', 'timeline', 'letters-in'];

export const useLettersOut = (params: Record<string, string | number>) =>
  useQuery({ queryKey: ['letters-out', params], queryFn: () => api.get<Page<LetterOutRow>>(`/letters-out${qs({ pageSize: 20, ...params })}`), placeholderData: (p) => p });
export const useLetterOut = (id: string) => useQuery({ queryKey: ['letter-out', id], queryFn: () => api.get<LetterOutDetail>(`/letters-out/${id}`) });
