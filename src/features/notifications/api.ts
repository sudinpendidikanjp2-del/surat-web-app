'use client';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '@/lib/api-client';

export interface Notice { id: number; tipe: string; judul: string; isi: string | null; link: string | null; dibaca: boolean; created_at: string }
export interface NoticePage { items: Notice[]; total: number; unread: number; page: number; pageSize: number }

export const useNotifications = (p: { page?: number; belum?: boolean } = {}) =>
  useQuery({ queryKey: ['notifications', p], queryFn: () => api.get<NoticePage>(`/notifications${qs({ page: p.page, pageSize: 20, belum: p.belum ? '1' : '' })}`), refetchInterval: 60_000 });

export const markRead = (body: { ids?: number[]; all?: boolean }) => api.post('/notifications/read', body);
