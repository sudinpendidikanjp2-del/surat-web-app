'use client';
import { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, DownloadIcon, FileSpreadsheetIcon, FileTextIcon, SlidersHorizontalIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { NativeSelect } from '@/components/ui/input';
import { TableHead } from '@/components/ui/table';
import { Alert } from '@/components/ui/alert';
import { api, qs } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { FilePicker } from './file-picker';
import type { ListState } from './use-list-state';

/** Kepala kolom yang dapat diurutkan. aria-sort memberi tahu pembaca layar arah urutan saat ini. */
export function SortHead({ col, ls, children, className }: { col: string; ls: ListState; children: React.ReactNode; className?: string }) {
  const on = ls.sort === col;
  const Icon = !on ? ChevronsUpDownIcon : ls.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead className={className} aria-sort={on ? (ls.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => ls.toggleSort(col)} className={cn('-mx-2 inline-flex h-11 cursor-pointer items-center gap-1 rounded-full px-2 hover:bg-muted hover:text-foreground sm:h-8', on && 'text-foreground')}>
        {children}<Icon className="size-3.5" aria-hidden />
      </button>
    </TableHead>
  );
}

/** Menu ekspor: berkas berisi seluruh hasil filter yang sedang dipakai, bukan hanya halaman ini. */
export function ExportMenu({ path, params, label = 'Ekspor' }: { path: string; params: Record<string, unknown>; label?: string }) {
  const href = (format: string) => `/api${path}${qs({ ...params, page: '', pageSize: '', format })}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline"><DownloadIcon aria-hidden /> {label}</Button></DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Unduh hasil filter saat ini</DropdownMenuLabel>
        <DropdownMenuItem asChild><a href={href('xlsx')} className="no-underline text-foreground"><FileSpreadsheetIcon aria-hidden /> Excel (.xlsx)</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={href('pdf')} className="no-underline text-foreground"><FileTextIcon aria-hidden /> PDF</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={href('csv')} className="no-underline text-foreground"><FileTextIcon aria-hidden /> CSV</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ImportResult { results: { baris: number; ok: boolean; error?: string }[]; ok: number; gagal: number }

/**
 * Impor dari Excel: unduh contoh file, isi, unggah. Setiap baris diproses sendiri;
 * hasilnya dirangkum dan baris yang gagal disebut nomor dan alasannya.
 */
export function ImportButton({ path, title, desc, keys, fields }: { path: string; title: string; desc: string; keys: string[]; fields?: Record<string, string> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<ImportResult | null>(null);
  const close = () => { setOpen(false); setFiles([]); setRes(null); setErr(''); };
  const run = async () => {
    if (!files[0]) return setErr('Pilih file Excel terlebih dahulu.');
    setBusy(true); setErr('');
    try {
      const r = await api.upload<ImportResult>(path, fields || {}, { file: files[0] });
      setRes(r);
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      if (r.gagal === 0) toast.success(`${r.ok} baris berhasil diimpor.`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><UploadIcon aria-hidden /> Impor</Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && close()}>
          <DialogContent>
            <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
            <DialogBody>
              {err && <Alert variant="late">{err}</Alert>}
              {res ? (
                <div className="flex flex-col gap-3">
                  <Alert variant={res.gagal ? 'warn' : 'ok'}>{res.ok} baris berhasil{res.gagal ? `, ${res.gagal} baris gagal` : ''}.</Alert>
                  {res.gagal > 0 && (
                    <ul className="flex max-h-72 flex-col divide-y divide-line overflow-y-auto rounded-2xl border border-border text-sm">
                      {res.results.filter((x) => !x.ok).map((x) => <li key={x.baris} className="flex gap-3 px-4 py-2"><span className="shrink-0 font-semibold">Baris {x.baris}</span><span className="text-late">{x.error}</span></li>)}
                    </ul>
                  )}
                </div>
              ) : (
                <>
                  <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
                    <li>Unduh <a href={`/api${path}`}>contoh file Excel</a>. Judul kolom di baris pertama jangan diubah.</li>
                    <li>Isi mulai baris kedua, satu baris untuk satu data.</li>
                    <li>Unggah file di bawah ini.</li>
                  </ol>
                  <FilePicker files={files} onChange={setFiles} multiple={false} accept=".xlsx" label="Pilih file Excel" />
                </>
              )}
            </DialogBody>
            <DialogFooter>
              {res ? <Button onClick={close}>Selesai</Button> : (
                <>
                  <Button variant="outline" onClick={close}>Batal</Button>
                  <Button disabled={busy} onClick={run}>{busy ? 'Mengimpor…' : 'Impor data'}</Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Tombol "Filter" dengan jumlah filter aktif; isi panelnya disediakan halaman. */
export function FilterPanel({ count, onReset, children, onApply }: { count: number; onReset: () => void; onApply: () => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-label={count ? `Filter, ${count} aktif` : 'Filter'}>
        <SlidersHorizontalIcon aria-hidden /> Filter{count ? <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-accent-foreground">{count}</span> : null}
      </Button>
      {open && (
        <Dialog open onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Filter</DialogTitle><DialogDescription>Hanya data yang cocok dengan semua pilihan ini yang ditampilkan dan diekspor.</DialogDescription></DialogHeader>
            <DialogBody><div className="grid gap-4 sm:grid-cols-2">{children}</div></DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => { onReset(); setOpen(false); }}>Hapus semua filter</Button>
              <Button onClick={() => { onApply(); setOpen(false); }}>Terapkan</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Halaman bernomor dan pilihan jumlah baris, seperti tabel di referensi. */
export function PagerFull({ page, pageSize, total, onPage, onSize }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onSize?: (n: number) => void }) {
  if (total === 0) return null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [...new Set([1, page - 1, page, page + 1, last].filter((n) => n >= 1 && n <= last))].sort((a, b) => a - b);
  return (
    <nav aria-label="Halaman daftar" className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span aria-live="polite">{from}-{to} dari <strong className="text-foreground">{total}</strong></span>
        {onSize && (
          <label className="flex items-center gap-2">Baris
            <NativeSelect value={pageSize} onChange={(e) => onSize(Number(e.target.value))} className="w-20" aria-label="Jumlah baris per halaman">
              {[10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </NativeSelect>
          </label>
        )}
      </div>
      {last > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Sebelumnya</Button>
          {nums.map((n, i) => (
            <span key={n} className="flex items-center">
              {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-muted-foreground" aria-hidden>…</span>}
              <button type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} aria-label={`Halaman ${n}`}
                className={cn('pressable inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-sm font-semibold sm:size-8', n === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>{n}</button>
            </span>
          ))}
          <Button variant="outline" size="sm" disabled={page >= last} onClick={() => onPage(page + 1)}>Berikutnya</Button>
        </div>
      )}
    </nav>
  );
}
