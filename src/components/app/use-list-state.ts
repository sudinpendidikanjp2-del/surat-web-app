'use client';
import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const BASE = new Set(['tampil', 'q', 'halaman', 'baris', 'urut', 'arah']);
export interface ListDefaults { sort?: string; dir?: 'asc' | 'desc'; size?: number }

/**
 * Keadaan daftar disimpan di alamat: tampilan, kata kunci, halaman, jumlah baris, urutan, dan filter lain.
 * Tombol Kembali dan tautan yang dibagikan menampilkan daftar yang sama persis.
 */
export function useListState<T extends string>(defaultView: T, defaults: ListDefaults = {}) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = (sp.get('tampil') as T) || defaultView;
  const q = sp.get('q') || '';
  const page = Math.max(1, Number(sp.get('halaman') || 1));
  const size = Number(sp.get('baris') || defaults.size || 20);
  const sort = sp.get('urut') || defaults.sort || '';
  const dir = (sp.get('arah') as 'asc' | 'desc') || defaults.dir || 'desc';
  const key = sp.toString();
  const filters = useMemo(() => {
    const o: Record<string, string> = {};
    new URLSearchParams(key).forEach((v, k) => { if (!BASE.has(k) && v) o[k] = v; });
    return o;
  }, [key]);
  const set = useCallback((patch: Record<string, string | number | undefined | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      const isDefault = (k === 'halaman' && v === 1) || (k === 'tampil' && v === defaultView) || (k === 'baris' && v === (defaults.size || 20));
      if (v === '' || v == null || isDefault) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('halaman' in patch)) next.delete('halaman');
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [sp, router, pathname, defaultView, defaults.size]);
  /** Ubah urutan: klik kolom yang sama membalik arah. */
  const toggleSort = useCallback((col: string) => {
    if (sort === col) set({ urut: col, arah: dir === 'asc' ? 'desc' : 'asc' });
    else set({ urut: col, arah: 'asc' });
  }, [sort, dir, set]);
  const filterCount = Object.keys(filters).length;
  return { view, q, page, size, sort, dir, filters, filterCount, set, toggleSort };
}
export type ListState = ReturnType<typeof useListState>;
