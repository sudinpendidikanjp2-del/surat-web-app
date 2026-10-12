'use client';
import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/** Keadaan daftar (tampilan, kata kunci, halaman) disimpan di alamat, jadi tombol Kembali dan tautan tetap bermakna. */
export function useListState<T extends string>(defaultView: T) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const view = (sp.get('tampil') as T) || defaultView;
  const q = sp.get('q') || '';
  const page = Math.max(1, Number(sp.get('halaman') || 1));
  const set = useCallback((patch: { tampil?: string; q?: string; halaman?: number }) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v == null || (k === 'halaman' && v === 1) || (k === 'tampil' && v === defaultView)) next.delete(k);
      else next.set(k, String(v));
    }
    if (!('halaman' in patch)) next.delete('halaman');
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  }, [sp, router, pathname, defaultView]);
  return { view, q, page, set };
}
