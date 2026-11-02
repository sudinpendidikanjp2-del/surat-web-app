'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LockIcon, PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionDialog } from '@/components/app/action-dialog';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection } from '@/components/app/bulk';
import { ExportMenu, ImportButton } from '@/components/app/data-table';
import { Field } from '@/components/app/form-field';
import { FilterButtons } from '@/components/app/list-controls';
import { Page, PageHeader, Panel } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import { isLockedRef, REF_KATEGORI, REF_KEYS, type RefItem, type RefKategori } from '@/domain/reference';
import { api } from '@/lib/api-client';

const KEYS = ['refs', 'refs-admin'];

/** Daftar pilihan yang dipakai di formulir: jenis surat, sifat, tindakan disposisi, dan cara pengiriman. */
export function ReferencePage() {
  const { view, set } = useListState<RefKategori>('jenis_surat');
  const k: RefKategori = REF_KEYS.includes(view) ? view : 'jenis_surat';
  const meta = REF_KATEGORI[k];
  const q = useQuery({ queryKey: ['refs-admin', k], queryFn: () => api.get<Record<string, RefItem[]>>(`/referensi?kategori=${k}&semua=1`) });
  const rows = q.data?.[k] || [];
  const sel = useSelection(rows.filter((r) => !isLockedRef(k, r.nilai)).map((r) => r.id), k);
  const bulk = useBulkAction(KEYS, (id) => rows.find((r) => r.id === id)?.nilai || `Data ${id}`);
  const [edit, setEdit] = useState<RefItem | 'baru' | null>(null);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  return (
    <Page wide>
      <PageHeader title="Data referensi" intro="Pilihan yang muncul di formulir. Ubah di sini tanpa mengubah aplikasi.">
        <ImportButton path="/referensi/impor" title={`Impor ${meta.label.toLowerCase()}`} desc="Kolom: Nilai (wajib), Keterangan, Urutan. Nilai yang sudah ada dilewati." keys={KEYS} fields={{ kategori: k }} />
        <ExportMenu path="/referensi" params={{ kategori: k }} />
        <Button onClick={() => setEdit('baru')}><PlusIcon aria-hidden /> Tambah</Button>
      </PageHeader>
      <FilterButtons label="Kategori" value={k} onChange={(v) => set({ tampil: v })} options={REF_KEYS.map((x) => ({ value: x, label: REF_KATEGORI[x].label }))} />
      <Panel>
        <p className="border-b border-line px-5 py-3 text-sm text-muted-foreground">{meta.desc}</p>
        <Async q={q} isEmpty={() => rows.length === 0} empty={<div className="p-4"><Empty title="Belum ada isian" /></div>}>
          {() => (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-5"><SelectAll sel={sel} /></TableHead>
                  <TableHead>Nilai</TableHead>
                  <TableHead className="hidden md:table-cell">Keterangan</TableHead>
                  <TableHead className="hidden sm:table-cell">Urutan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Tindakan</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((x) => {
                  const locked = isLockedRef(k, x.nilai);
                  return (
                    <TableRow key={x.id} data-state={sel.has(x.id) ? 'selected' : undefined}>
                      <TableCell className="pl-5">{locked ? <LockIcon className="size-4 text-muted-foreground" aria-label="Dipakai sistem" /> : <SelectRow sel={sel} id={x.id} label={x.nilai} />}</TableCell>
                      <TableCell className="font-semibold">{x.nilai}</TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{x.keterangan || '-'}</TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">{x.urutan}</TableCell>
                      <TableCell>{x.aktif ? <Badge tone="ok">Aktif</Badge> : <Badge tone="late">Nonaktif</Badge>}{locked && <span className="ml-2 text-xs text-muted-foreground">Dipakai sistem</span>}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit(x)} aria-label={`Ubah ${x.nilai}`}>Ubah</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Async>
      </Panel>
      <BulkBar sel={sel}>
        <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>Aktifkan</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>Nonaktifkan</Button>
      </BulkBar>
      {bulk.dialog}
      {confirm !== null && (
        <ActionDialog open onOpenChange={(o) => !o && setConfirm(null)} title={`${confirm ? 'Aktifkan' : 'Nonaktifkan'} ${sel.count} isian?`} confirmLabel={confirm ? 'Aktifkan' : 'Nonaktifkan'} pending={bulk.pending}
          description={confirm ? 'Isian kembali muncul di formulir.' : 'Isian tidak muncul lagi di formulir. Data lama yang sudah memakainya tidak berubah.'}
          onConfirm={async () => { if (await bulk.run('/referensi/bulk/aktif', { aktif: confirm }, confirm ? 'diaktifkan' : 'dinonaktifkan', sel)) setConfirm(null); }} />
      )}
      {edit && <RefDialog k={k} item={edit === 'baru' ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function RefDialog({ k, item, onClose }: { k: RefKategori; item: RefItem | null; onClose: () => void }) {
  const locked = item ? isLockedRef(k, item.nilai) : false;
  const [v, setV] = useState({ nilai: item?.nilai || '', keterangan: item?.keterangan || '', urutan: String(item?.urutan ?? 0), aktif: item?.aktif ?? true });
  const [err, setErr] = useState('');
  const save = useAction(() => (item ? api.put(`/referensi/${item.id}`, { ...v, urutan: Number(v.urutan) || 0 }) : api.post('/referensi', { ...v, kategori: k, urutan: Number(v.urutan) || 0 })), {
    success: 'Data referensi disimpan.', keys: KEYS, onDone: onClose,
  });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={item ? `Ubah ${item.nilai}` : `Tambah ${REF_KATEGORI[k].label.toLowerCase()}`} error={err || save.error?.message}
      confirmLabel="Simpan" pending={save.isPending} onConfirm={() => { if (!v.nilai.trim()) return setErr('Nilai wajib diisi.'); setErr(''); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Nilai" required hint={locked ? 'Dipakai sistem, jadi namanya tidak dapat diubah.' : undefined}>{(p) => <Input {...p} value={v.nilai} disabled={locked} onChange={(e) => setV({ ...v, nilai: e.target.value })} />}</Field>
        <Field label="Urutan">{(p) => <Input {...p} type="number" inputMode="numeric" min={0} value={v.urutan} onChange={(e) => setV({ ...v, urutan: e.target.value })} />}</Field>
        <Field className="sm:col-span-2" label="Keterangan">{(p) => <Input {...p} value={v.keterangan} onChange={(e) => setV({ ...v, keterangan: e.target.value })} />}</Field>
        {item && !locked && <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2"><Checkbox checked={v.aktif} onCheckedChange={(c) => setV({ ...v, aktif: c === true })} /> Aktif (muncul di formulir)</label>}
      </div>
    </ActionDialog>
  );
}
