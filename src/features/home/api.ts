'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { SlaIndicator } from '@/domain/sla';

export interface DashboardData {
  role: string;
  counts: Record<string, number>;
  keluar: Record<string, number>;
  perlu_disposisi?: { id: number; no_agenda: string; perihal: string; asal: string; sifat: string; prioritas: string; tgl_diterima: string }[];
  tugas_perhatian?: { id: number; judul: string; deadline: string; pic_nama: string; no_agenda: string; terlambat: boolean }[];
  perlu_persetujuan?: { id: number; no_agenda: string; perihal: string; jenis: string; pembuat: string }[];
  antrian_tu?: { id: number; no_agenda: string; perihal: string; asal: string; tgl_diterima: string }[];
  nomor_terakhir?: { id: number; nomor_surat: string; no_agenda: string } | null;
  tugas_saya?: Record<string, number>;
  disposisi_baru?: { id: number; letter_in_id: number; instruksi: string; deadline: string; prioritas: string; no_agenda: string; perihal: string; dari: string }[];
  tugas_terdekat?: { id: number; judul: string; deadline: string; status: string; progress: number; no_agenda: string; perihal: string; sla: SlaIndicator }[];
}

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<DashboardData>('/dashboard') });
