'use client';
import { useQuery } from '@tanstack/react-query';
import type { Instansi, RefItem, RefKategori } from '@/domain/reference';
import { api } from '@/lib/api-client';

/** Daftar referensi aktif untuk pilihan di formulir. */
export const useRefs = () => useQuery({ queryKey: ['refs'], queryFn: () => api.get<Record<RefKategori, RefItem[]>>('/referensi'), staleTime: 300_000 });
export function useRefValues(kategori: RefKategori, fallback: readonly string[]) {
  const q = useRefs();
  return q.data?.[kategori]?.map((x) => x.nilai) ?? [...fallback];
}

export type InstansiOption = Pick<Instansi, 'id' | 'nama' | 'singkatan' | 'alamat'>;
export const useInstansiOptions = () => useQuery({ queryKey: ['instansi-options'], queryFn: () => api.get<InstansiOption[]>('/instansi/options'), staleTime: 300_000 });
