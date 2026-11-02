'use client';
import { useId, useState } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Tampilan daftar sebagai tab tersegmen. aria-pressed memberi tahu pembaca layar mana yang aktif. Bergulir ke samping di ponsel. */
export function FilterButtons<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:w-fit sm:rounded-full sm:bg-muted sm:p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)}
            className={cn('pressable inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-semibold sm:h-8',
              on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-card hover:text-foreground')}>
            {o.label}
            {o.count != null && <span className={cn('rounded-full px-1.5 text-xs tabular-nums', on ? 'bg-accent text-accent-foreground' : 'bg-card')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Kotak cari. Pencarian berjalan saat Enter atau tombol Cari; tidak setiap ketukan, agar daftar tidak berkedip. */
export function SearchForm({ value, onSearch, label = 'Cari', placeholder, className }: { value: string; onSearch: (q: string) => void; label?: string; placeholder?: string; className?: string }) {
  const id = useId();
  const [v, setV] = useState(value);
  // Ikuti nilai dari alamat (misalnya setelah tombol Kembali) tanpa efek tambahan.
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setV(value); }
  return (
    <form role="search" className={cn('flex w-full gap-2 sm:max-w-md', className)} onSubmit={(e) => { e.preventDefault(); onSearch(v.trim()); }}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input id={id} type="search" value={v} placeholder={placeholder || label} onChange={(e) => setV(e.target.value)} className="rounded-full pl-10 pr-10" />
        {value && (
          <button type="button" aria-label="Hapus pencarian" onClick={() => { setV(''); onSearch(''); }}
            className="absolute right-0 top-1/2 inline-flex size-11 -translate-y-1/2 sm:right-1 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:size-8">
            <XIcon className="size-4" aria-hidden />
          </button>
        )}
      </div>
      <Button type="submit" variant="dark">Cari</Button>
    </form>
  );
}

/** Halaman: posisi dan dua tombol. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Halaman daftar" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p aria-live="polite" className="text-muted-foreground">{from} sampai {to} dari <span className="font-semibold text-foreground">{total}</span></p>
      {last > 1 && (
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground sm:inline">Halaman {page} dari {last}</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</Button>
          <Button variant="outline" size="sm" disabled={page >= last} onClick={() => onPage(page + 1)}>Berikutnya</Button>
        </div>
      )}
    </nav>
  );
}
