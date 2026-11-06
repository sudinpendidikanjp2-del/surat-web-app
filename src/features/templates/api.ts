'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { TemplateField } from '@/domain/letter-out';

export interface TemplateRow { id: number; nama: string; kode: string; jenis: string; deskripsi: string | null; aktif: boolean; versi_aktif_id: number | null; versi_aktif: number | null; jumlah_versi: number }
export interface TemplateDetail { template: TemplateRow & { kode_klasifikasi: string | null }; versions: { id: number; versi: number; catatan: string | null; aktif: boolean; created_at: string; dibuat_oleh: string | null; fields: TemplateField[] }[] }

export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api.get<TemplateRow[]>('/templates') });
export const useTemplate = (id: string | number | null) => useQuery({ queryKey: ['template', String(id)], queryFn: () => api.get<TemplateDetail>(`/templates/${id}`), enabled: Boolean(id) });
