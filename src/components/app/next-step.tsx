import Link from 'next/link';
import { Button } from '@/components/ui/button';

export interface StepAction { label: string; onClick?: () => void; href?: string }
export interface NextStepInfo { title: string; desc?: string; quiet?: boolean; primary?: StepAction }

/** "Langkah berikutnya": satu kalimat apa yang perlu dilakukan sekarang, dan tepat satu tombol utama. */
export function NextStep({ step, busy }: { step: NextStepInfo; busy?: boolean }) {
  const p = step.primary;
  return (
    <section aria-labelledby="langkah" className={`flex flex-col gap-4 rounded-lg border-2 p-5 sm:p-6 ${step.quiet ? 'border-[#d6d1c4] bg-card' : 'border-primary bg-primary-soft'}`}>
      <div className="flex flex-col gap-1">
        <p className="font-bold text-primary">Langkah berikutnya</p>
        <h2 id="langkah" className="text-xl sm:text-2xl">{step.title}</h2>
        {step.desc && <p className="text-lg">{step.desc}</p>}
      </div>
      {p && (
        <div className="no-print">
          {p.href ? <Button asChild size="lg" className="no-underline"><Link href={p.href}>{p.label}</Link></Button>
            : <Button size="lg" disabled={busy} onClick={p.onClick}>{busy ? 'Sedang diproses…' : p.label}</Button>}
        </div>
      )}
    </section>
  );
}

/** Tindakan lain: terlihat semua (tidak disembunyikan di menu), masing-masing dengan penjelasan satu baris. */
export function OtherActions({ items }: { items: (StepAction & { desc: string; danger?: boolean })[] }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="tindakan-lain" className="no-print flex flex-col gap-3">
      <h2 id="tindakan-lain" className="text-xl">Yang juga bisa Anda lakukan</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((it) => (
          <li key={it.label} className="flex flex-col gap-2 rounded-md border-2 border-[#d6d1c4] bg-card p-4">
            {it.href ? <Button asChild variant={it.danger ? 'destructive' : 'outline'} className="w-full justify-start no-underline"><Link href={it.href}>{it.label}</Link></Button>
              : <Button variant={it.danger ? 'destructive' : 'outline'} className="w-full justify-start" onClick={it.onClick}>{it.label}</Button>}
            <p className="text-muted-foreground">{it.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
