'use client';
import { useId, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Pilihan tampilan berupa tombol besar yang jelas terpilih (bukan menu tarik-turun). */
export function FilterButtons<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}
          className={cn('min-h-[48px] cursor-pointer rounded-md border-2 px-4 text-base font-bold transition-colors',
            o.value === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}>
          {o.value === value && <span className="sr-only">Dipilih: </span>}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Kotak cari dengan tombol "Cari" yang jelas. Pencarian baru berjalan saat tombol ditekan atau Enter. */
export function SearchForm({ value, onSearch, label = 'Cari', placeholder }: { value: string; onSearch: (q: string) => void; label?: string; placeholder?: string }) {
  const id = useId();
  const [v, setV] = useState(value);
  // Ikuti nilai dari alamat (misalnya setelah tombol Kembali) tanpa efek tambahan.
  const [prev, setPrev] = useState(value);
  if (prev !== value) { setPrev(value); setV(value); }
  return (
    <form role="search" className="flex w-full max-w-2xl flex-col gap-2" onSubmit={(e) => { e.preventDefault(); onSearch(v.trim()); }}>
      <label htmlFor={id} className="font-bold">{label}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id={id} type="search" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />
        <Button type="submit" className="sm:w-auto"><SearchIcon aria-hidden /> Cari</Button>
        {value && <Button type="button" variant="outline" onClick={() => { setV(''); onSearch(''); }}>Hapus Pencarian</Button>}
      </div>
    </form>
  );
}

/** Halaman: kalimat posisi dan dua tombol besar. Tidak ada deretan nomor kecil yang sulit diketuk. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Halaman daftar" className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">Menampilkan <strong>{from} sampai {to}</strong> dari <strong>{total}</strong>. Halaman {page} dari {last}.</p>
      {last > 1 && (
        <div className="flex gap-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Halaman Sebelumnya</Button>
          <Button variant="outline" disabled={page >= last} onClick={() => onPage(page + 1)}>Halaman Berikutnya</Button>
        </div>
      )}
    </nav>
  );
}
