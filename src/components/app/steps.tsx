import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tahapan berurutan ke bawah (benang urusan). Tahap selesai bercentang; tahap sekarang ditandai tulisan. */
export function Steps({ items, label }: { items: { key: string; label: string; done: boolean; tanggal?: string | null }[]; label: string }) {
  const current = items.findIndex((s) => !s.done);
  return (
    <ol className="flex flex-col" aria-label={label}>
      {items.map((s, i) => (
        <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className={cn('absolute left-[9px] top-6 bottom-0.5 w-0.5', s.done ? 'bg-primary' : 'bg-line')} />}
          <span aria-hidden className={cn('relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
            s.done ? 'border-primary bg-primary text-primary-foreground' : i === current ? 'border-accent bg-accent' : 'border-strong bg-card')}>
            {s.done && <CheckIcon className="size-3" strokeWidth={3.5} />}
          </span>
          <span className="flex flex-col">
            <span className={cn('text-sm', s.done || i === current ? 'font-semibold' : 'text-muted-foreground')}>
              {s.label}
              <span className="sr-only">{s.done ? ', sudah' : i === current ? ', tahap sekarang' : ', belum'}</span>
            </span>
            {i === current && <span className="text-xs font-semibold text-accent-ink">Tahap sekarang</span>}
            {s.tanggal && <span className="text-sm text-muted-foreground">{s.tanggal}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
