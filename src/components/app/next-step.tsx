'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface StepAction { label: string; onClick?: () => void; href?: string }
export interface NextStepInfo { title: string; desc?: string; quiet?: boolean; primary?: StepAction }

/** "Langkah berikutnya": apa yang perlu dilakukan sekarang dan satu tombol utama. Satu titik fokus per halaman detail. */
export function NextStep({ step, busy, children }: { step: NextStepInfo; busy?: boolean; children?: React.ReactNode }) {
  const p = step.primary;
  return (
    <section aria-labelledby="langkah" className={cn('flex flex-col gap-3 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between', step.quiet ? 'border-border bg-card' : 'border-accent bg-accent-soft')}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-xs font-semibold text-accent-ink">Langkah berikutnya</p>
        <h2 id="langkah" className="text-base font-bold">{step.title}</h2>
        {step.desc && <p className="text-sm text-muted-foreground">{step.desc}</p>}
      </div>
      {(p || children) && (
        <div className="no-print flex shrink-0 flex-wrap gap-2">
          {p && (p.href ? <Button asChild><Link href={p.href}>{p.label}</Link></Button>
            : <Button disabled={busy} onClick={p.onClick}>{busy ? 'Memproses…' : p.label}</Button>)}
          {children}
        </div>
      )}
    </section>
  );
}

/** Tindakan lain dalam satu menu "Aksi lain". Tindakan merusak dipisah di bawah garis dan berwarna merah. */
export function OtherActions({ items, className }: { items: (StepAction & { desc?: string; danger?: boolean })[]; className?: string }) {
  const router = useRouter();
  if (!items.length) return null;
  const safe = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  const run = (it: StepAction) => (it.href ? router.push(it.href) : it.onClick?.());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('no-print', className)}><MoreHorizontalIcon aria-hidden /> Aksi lain</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        {safe.map((it) => <DropdownMenuItem key={it.label} onSelect={() => run(it)}>{it.label}</DropdownMenuItem>)}
        {danger.length > 0 && safe.length > 0 && <DropdownMenuSeparator />}
        {danger.map((it) => <DropdownMenuItem key={it.label} danger onSelect={() => run(it)}>{it.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
