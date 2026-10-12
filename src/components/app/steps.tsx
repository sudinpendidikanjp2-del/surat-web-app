import { CheckIcon } from 'lucide-react';

/** Tahapan berurutan ke bawah. Tahap selesai bercentang; tahap sekarang ditandai dengan tulisan. */
export function Steps({ items, label }: { items: { key: string; label: string; done: boolean; tanggal?: string | null }[]; label: string }) {
  const current = items.findIndex((s) => !s.done);
  return (
    <ol className="flex flex-col" aria-label={label}>
      {items.map((s, i) => (
        <li key={s.key} className="relative flex gap-4 pb-5 last:pb-0">
          {i < items.length - 1 && <span aria-hidden className={`absolute left-[15px] top-9 bottom-1 w-[3px] ${s.done ? 'bg-primary' : 'bg-[#cfcabd]'}`} />}
          <span aria-hidden className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-[3px] ${s.done ? 'border-primary bg-primary text-primary-foreground' : i === current ? 'border-primary bg-card' : 'border-[#a8a294] bg-card'}`}>
            {s.done && <CheckIcon className="size-5" strokeWidth={3.5} />}
          </span>
          <span className="flex flex-col pt-0.5">
            <span className={`text-lg ${s.done ? 'font-bold' : i === current ? 'font-bold' : 'text-muted-foreground'}`}>
              {s.label}
              <span className="sr-only">{s.done ? ', sudah' : i === current ? ', tahap sekarang' : ', belum'}</span>
            </span>
            {i === current && <span className="font-semibold text-primary">Tahap sekarang</span>}
            {s.tanggal && <span className="text-muted-foreground">{s.tanggal}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
