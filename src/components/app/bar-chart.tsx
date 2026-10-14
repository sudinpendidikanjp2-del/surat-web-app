'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Series { key: string; label: string; color: string }

/**
 * Batang berkelompok per kategori (bulan). Satu sumbu, batang tipis dengan ujung membulat 4px yang menempel ke dasar,
 * celah 2px antarbatang, legenda selalu tampil, nilai di tooltip saat disorot atau difokus, dan tampilan tabel.
 */
export function GroupedBars({ data, series, label, height = 180 }: { data: ({ name: string } & Record<string, number | string>)[]; series: Series[]; label: string; height?: number }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)));
  const nice = max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const ticks = [0, nice / 2, nice];
  return (
    <figure className="flex flex-col gap-3" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-4 text-sm" aria-label="Keterangan">
          {series.map((s) => <li key={s.key} className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-[3px]" style={{ background: s.color }} />{s.label}</li>)}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Lihat grafik' : 'Lihat tabel'}</Button>
      </div>
      {table ? (
        <Table>
          <TableHeader><TableRow><TableHead>Bulan</TableHead>{series.map((s) => <TableHead key={s.key} className="text-right">{s.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{data.map((d) => <TableRow key={d.name}><TableCell>{d.name}</TableCell>{series.map((s) => <TableCell key={s.key} className="text-right tabular-nums">{d[s.key]}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      ) : (
        <div className="flex gap-2">
          <div className="flex flex-col justify-between pb-6 text-right text-xs tabular-nums text-muted-foreground" style={{ height: height + 24 }} aria-hidden>
            {[...ticks].reverse().map((t) => <span key={t}>{t}</span>)}
          </div>
          <div className="relative flex-1">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }}>
              {ticks.map((t) => <span key={t} className="border-t border-line" />)}
            </div>
            <ol className="relative flex items-end justify-between gap-1" style={{ height: height + 24 }}>
              {data.map((d, i) => (
                <li key={d.name} className="relative flex h-full flex-1 flex-col items-center">
                  <button type="button" className="group flex w-full flex-1 cursor-default items-end justify-center gap-0.5 rounded-lg outline-offset-0"
                    onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                    aria-label={`${d.name}: ${series.map((s) => `${s.label} ${d[s.key]}`).join(', ')}`}>
                    {series.map((s) => {
                      const v = Number(d[s.key]) || 0;
                      return <span key={s.key} className="w-full max-w-3 rounded-t-[4px] transition-opacity duration-150" style={{ height: `${(v / nice) * height}px`, minHeight: v ? 3 : 0, background: s.color, opacity: hover == null || hover === i ? 1 : 0.45 }} />;
                    })}
                  </button>
                  <span className="mt-1.5 h-[18px] text-xs text-muted-foreground">{d.name}</span>
                  {hover === i && (
                    <div role="tooltip" className={cn('pointer-events-none absolute bottom-full z-10 mb-1 min-w-32 rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg', i > data.length - 3 ? 'right-0' : i < 2 ? 'left-0' : 'left-1/2 -translate-x-1/2')}>
                      <p className="mb-1 font-semibold">{d.name}</p>
                      {series.map((s) => <p key={s.key} className="flex items-center justify-between gap-3"><span className="flex items-center gap-1.5"><span className="size-2 rounded-[2px]" style={{ background: s.color }} />{s.label}</span><span className="font-semibold tabular-nums">{d[s.key]}</span></p>)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </figure>
  );
}
