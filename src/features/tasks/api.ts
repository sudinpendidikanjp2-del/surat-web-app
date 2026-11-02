'use client';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api-client';
import type { SlaIndicator } from '@/domain/sla';
import type { Page } from '@/features/letters-in/api';

export interface TaskRow { id: number; letter_in_id: number; judul: string; deadline: string | null; prioritas: string; status: string; statusLabel: string; progress: number; pic_nama: string; assigner_nama: string; no_agenda: string; perihal: string; sla: SlaIndicator }
export interface DispRow { id: number; letter_in_id: number; tindakan: string[]; instruksi: string; deadline: string | null; prioritas: string; status: string; no_agenda: string; perihal: string; asal: string; dari: string; kepada: string }
export interface TaskDetail {
  task: TaskRow & { deskripsi: string | null; pic_user_id: number; assigner_id: number; checklist: { teks: string; selesai: boolean }[] };
  updates: { id: number; status: string; progress: number; catatan: string | null; created_at: string; user_nama: string }[];
  attachments: { id: number; nama: string; kategori: string; versi: number; ukuran: number; uploader: string | null; created_at: string }[];
  can: { update: boolean; batal: boolean; edit: boolean; buka: boolean };
}

export const useTasks = (params: Record<string, string | number>) =>
  useQuery({ queryKey: ['tasks', params], queryFn: () => api.get<Page<TaskRow>>(`/tasks${qs({ pageSize: 20, ...params })}`) });
export const useDispositions = (params: Record<string, string | number>) =>
  useQuery({ queryKey: ['dispositions', params], queryFn: () => api.get<Page<DispRow>>(`/dispositions${qs({ pageSize: 20, ...params })}`) });
export const useTask = (id: string) => useQuery({ queryKey: ['task', id], queryFn: () => api.get<TaskDetail>(`/tasks/${id}`) });
