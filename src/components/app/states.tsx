'use client';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangleIcon, InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Memuat: kalimat yang jelas, bukan hanya kerangka abu yang bisa dikira halaman kosong. */
export function Loading({ label = 'Sedang memuat data…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-live="polite">
      <p className="font-semibold">{label}</p>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-5" style={{ width: `${90 - i * 15}%` }} />)}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border-2 border-late bg-late-soft p-5 text-late" role="alert">
      <p className="flex items-center gap-2 text-lg font-bold"><AlertTriangleIcon className="size-6" aria-hidden /> Data tidak dapat dimuat</p>
      <p>{error?.message || 'Terjadi kesalahan.'}</p>
      {retry && <Button variant="outline" onClick={retry}>Coba Muat Lagi</Button>}
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border-2 border-dashed border-[#a8a294] bg-card p-6">
      <p className="flex items-center gap-2 text-lg font-bold"><InboxIcon className="size-6" aria-hidden /> {title}</p>
      {text && <p className="text-muted-foreground">{text}</p>}
      {action}
    </div>
  );
}

/** Tiga keadaan setiap data: memuat, galat, kosong, lalu isi. */
export function Async<T>({ q, isEmpty, empty, loadingLabel, children }: {
  q: UseQueryResult<T>; isEmpty?: (d: T) => boolean; empty?: React.ReactNode; loadingLabel?: string; children: (d: T) => React.ReactNode;
}) {
  if (q.isPending) return <Loading label={loadingLabel} />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data as T;
  const blank = isEmpty ? isEmpty(d) : Array.isArray(d) && d.length === 0;
  if (blank) return <>{empty ?? <Empty title="Belum ada data" />}</>;
  return <>{children(d)}</>;
}
