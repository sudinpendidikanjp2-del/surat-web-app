'use client';
import type { UseQueryResult } from '@tanstack/react-query';
import { AlertTriangleIcon, InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** Memuat: kerangka abu dengan kalimat untuk pembaca layar. */
export function Loading({ label = 'Memuat data…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="flex flex-col gap-2.5 py-1" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-4" style={{ width: `${92 - i * 14}%` }} />)}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: Error | null; retry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-2xl bg-late-soft p-4 text-late" role="alert">
      <p className="flex items-center gap-2 font-semibold"><AlertTriangleIcon className="size-4" aria-hidden /> Data tidak dapat dimuat</p>
      <p className="text-sm">{error?.message || 'Terjadi kesalahan.'}</p>
      {retry && <Button variant="outline" size="sm" onClick={retry}>Muat ulang</Button>}
    </div>
  );
}

/** Kosong: apa artinya dan apa yang dapat dilakukan. `compact` untuk bagian di dalam halaman detail. */
export function Empty({ title, text, action, compact }: { title: string; text?: React.ReactNode; action?: React.ReactNode; compact?: boolean }) {
  if (compact) return (
    <div className="rounded-2xl border border-dashed border-strong px-4 py-3 text-sm">
      <p className="font-medium">{title}</p>
      {text && <p className="text-muted-foreground">{text}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-strong bg-card px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><InboxIcon className="size-5" aria-hidden /></span>
      <p className="font-semibold">{title}</p>
      {text && <p className="max-w-md text-sm text-muted-foreground">{text}</p>}
      {action && <div className="pt-1">{action}</div>}
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
