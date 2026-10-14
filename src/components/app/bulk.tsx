'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';

export interface BulkResult { results: { id: number; ok: boolean; error?: string }[]; ok: number; gagal: number }

/**
 * Pilihan baris untuk aksi massal. Pilihan hanya berlaku pada halaman yang sedang tampil: saat tampilan,
 * pencarian, atau halaman berubah (`scope`), pilihan dikosongkan agar tidak ada data tersembunyi yang ikut terproses.
 */
export function useSelection(pageIds: number[], scope: string) {
  const [state, setState] = useState<{ scope: string; ids: Set<number> }>({ scope, ids: new Set() });
  const ids = state.scope === scope ? state.ids : new Set<number>();
  const visible = pageIds.filter((id) => ids.has(id));
  const all = pageIds.length > 0 && visible.length === pageIds.length;
  const update = (next: Set<number>) => setState({ scope, ids: next });
  return {
    selected: visible,
    count: visible.length,
    has: (id: number) => ids.has(id),
    toggle: (id: number) => { const n = new Set(ids); if (n.has(id)) n.delete(id); else n.add(id); update(n); },
    toggleAll: () => update(all ? new Set() : new Set(pageIds)),
    clear: () => update(new Set()),
    headerState: (all ? true : visible.length ? 'indeterminate' : false) as boolean | 'indeterminate',
  };
}
export type Selection = ReturnType<typeof useSelection>;

/** Area ketuk diperluas ke 44px dengan pseudo-elemen, tanpa membesarkan kotak centangnya. */
const HIT = "relative after:absolute after:-inset-[13px] after:content-['']";

export const SelectAll = ({ sel, label = 'Pilih semua di halaman ini' }: { sel: Selection; label?: string }) =>
  <Checkbox className={HIT} checked={sel.headerState} onCheckedChange={sel.toggleAll} aria-label={label} />;

export const SelectRow = ({ sel, id, label }: { sel: Selection; id: number; label: string }) =>
  <Checkbox className={HIT} checked={sel.has(id)} onCheckedChange={() => sel.toggle(id)} aria-label={`Pilih ${label}`} />;

/** Bilah aksi massal: muncul dari bawah saat ada baris terpilih (200ms ease-out), di atas bilah menu ponsel. */
export function BulkBar({ sel, children }: { sel: Selection; children: React.ReactNode }) {
  if (!sel.count) return null;
  return (
    <div role="region" aria-label="Aksi untuk data terpilih"
      className="no-print fixed inset-x-3 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-full bg-primary p-1.5 pl-5 text-primary-foreground shadow-xl animate-in fade-in-0 slide-in-from-bottom-3 duration-200 lg:bottom-6 lg:left-64">
      <p className="mr-auto text-sm font-semibold" aria-live="polite">{sel.count} dipilih</p>
      {children}
      <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-white/10" onClick={sel.clear}>Batal pilih</Button>
    </div>
  );
}

/**
 * Menjalankan aksi massal: server memproses satu per satu, yang gagal tidak membatalkan yang lain.
 * Hasil ringkas tampil sebagai pesan; bila ada yang gagal, alasannya per data tampil di dialog.
 */
export function useBulkAction(keys: string[], labelOf: (id: number) => string) {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<{ title: string; failed: { id: number; error?: string }[] } | null>(null);
  const run = async (path: string, body: Record<string, unknown>, verb: string, sel: Selection) => {
    setPending(true);
    try {
      const r = await api.post<BulkResult>(path, { ...body, ids: sel.selected });
      await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
      if (r.gagal === 0) toast.success(`${r.ok} data berhasil ${verb}.`);
      else {
        toast.warning(`${r.ok} berhasil, ${r.gagal} tidak dapat ${verb}.`);
        setReport({ title: `${r.gagal} data tidak dapat ${verb}`, failed: r.results.filter((x) => !x.ok) });
      }
      sel.clear();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setPending(false);
    }
  };
  const dialog = report && (
    <Dialog open onOpenChange={(o) => !o && setReport(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{report.title}</DialogTitle><DialogDescription>Data lain sudah diproses. Berikut alasannya untuk masing-masing.</DialogDescription></DialogHeader>
        <DialogBody>
          <ul className="flex flex-col divide-y divide-line text-sm">
            {report.failed.map((f) => <li key={f.id} className="flex flex-col gap-0.5 py-2"><span className="font-semibold">{labelOf(f.id)}</span><span className="text-late">{f.error}</span></li>)}
          </ul>
        </DialogBody>
        <DialogFooter><Button onClick={() => setReport(null)}>Mengerti</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { run, pending, dialog };
}
