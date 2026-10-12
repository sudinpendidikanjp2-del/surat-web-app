'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Aksi ke server dengan pesan hasil dan penyegaran data. `keys`: awalan queryKey yang perlu dimuat ulang.
 * Pesan berhasil selalu menyebut apa yang terjadi, bukan sekadar "Berhasil".
 */
export function useAction<TVars = void, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  { success, keys = [], onDone }: { success?: string | ((data: TData, vars: TVars) => string); keys?: string[]; onDone?: (data: TData, vars: TVars) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success);
      onDone?.(data, vars);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
