'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Textarea } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionDialog } from '@/components/app/action-dialog';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection } from '@/components/app/bulk';
import { ExportMenu, ImportButton, PagerFull, SortHead } from '@/components/app/data-table';
import { Field } from '@/components/app/form-field';
import { FilterButtons, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader, Panel } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import type { Instansi } from '@/domain/reference';
import { api, qs } from '@/lib/api-client';

type View = 'aktif' | 'nonaktif' | 'semua';
const KEYS = ['instansi', 'instansi-options'];

/** Daftar instansi pengirim dan tujuan surat. Dipakai sebagai saran saat mencatat surat masuk. */
export function InstansiPage() {
  const ls = useListState<View>('aktif', { sort: 'nama', dir: 'asc' });
  const { view, q, page, size, sort, dir, set } = ls;
  const params = { q, page, pageSize: size, sort, dir, aktif: view === 'aktif' ? '1' : view === 'nonaktif' ? '0' : '' };
  const list = useQuery({ queryKey: ['instansi', params], queryFn: () => api.get<{ items: Instansi[]; total: number; page: number; pageSize: number }>(`/instansi${qs(params)}`), placeholderData: (p) => p });
  const rows = list.data?.items || [];
  const sel = useSelection(rows.map((r) => r.id), `${view}|${q}|${page}`);
  const bulk = useBulkAction(KEYS, (id) => rows.find((r) => r.id === id)?.nama || `Instansi ${id}`);
  const [edit, setEdit] = useState<Instansi | 'baru' | null>(null);
  const [confirm, setConfirm] = useState<boolean | null>(null);
  return (
    <Page wide>
      <PageHeader title="Instansi" intro="Instansi pengirim dan tujuan surat. Muncul sebagai saran saat mencatat surat masuk.">
        <ImportButton path="/instansi/impor" title="Impor instansi dari Excel" desc="Nama yang sudah ada dilewati dan dilaporkan." keys={KEYS} />
        <ExportMenu path="/instansi" params={params} />
        <Button onClick={() => setEdit('baru')}><PlusIcon aria-hidden /> Tambah Instansi</Button>
      </PageHeader>
      <Panel>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterButtons label="Tampilkan" value={view} onChange={(v) => set({ tampil: v })} options={[{ value: 'aktif', label: 'Aktif' }, { value: 'nonaktif', label: 'Tidak dipakai' }, { value: 'semua', label: 'Semua' }]} />
          <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari instansi" placeholder="Nama, singkatan, atau alamat" className="sm:w-80" />
        </div>
        <Async q={list} isEmpty={(d) => d.items.length === 0} empty={<div className="p-4"><Empty title={q ? 'Tidak ada instansi yang cocok' : 'Belum ada instansi'} text="Tambahkan satu per satu atau impor dari Excel." /></div>}>
          {(d) => (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 pl-5"><SelectAll sel={sel} /></TableHead>
                    <SortHead col="nama" ls={ls}>Nama</SortHead>
                    <SortHead col="singkatan" ls={ls} className="hidden md:table-cell">Singkatan</SortHead>
                    <TableHead className="hidden lg:table-cell">Kontak</TableHead>
                    <SortHead col="surat" ls={ls} className="hidden sm:table-cell">Surat</SortHead>
                    <TableHead className="text-right"><span className="sr-only">Tindakan</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.items.map((x) => (
                    <TableRow key={x.id} data-state={sel.has(x.id) ? 'selected' : undefined}>
                      <TableCell className="pl-5"><SelectRow sel={sel} id={x.id} label={x.nama} /></TableCell>
                      <TableCell className="max-w-md">
                        <span className="flex items-center gap-2 font-semibold">{x.nama}{!x.aktif && <Badge tone="late">Tidak dipakai</Badge>}</span>
                        {x.alamat && <span className="block truncate text-muted-foreground">{x.alamat}</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{x.singkatan || '-'}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{[x.telepon, x.email].filter(Boolean).join(' · ') || '-'}</TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">{x.jumlah_surat}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setEdit(x)} aria-label={`Ubah ${x.nama}`}>Ubah</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="border-t border-line p-4"><PagerFull page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set({ halaman: p })} onSize={(n) => set({ baris: n })} /></div>
            </>
          )}
        </Async>
      </Panel>
      <BulkBar sel={sel}>
        <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>Aktifkan</Button>
        <Button size="sm" variant="outline" onClick={() => setConfirm(false)}>Tandai tidak dipakai</Button>
      </BulkBar>
      {bulk.dialog}
      {confirm !== null && (
        <ActionDialog open onOpenChange={(o) => !o && setConfirm(null)} title={`${confirm ? 'Aktifkan' : 'Tandai tidak dipakai'} ${sel.count} instansi?`} confirmLabel={confirm ? 'Aktifkan' : 'Tandai tidak dipakai'} pending={bulk.pending}
          description={confirm ? 'Instansi kembali muncul sebagai saran.' : 'Instansi tidak muncul lagi sebagai saran. Surat lama tidak berubah.'}
          onConfirm={async () => { if (await bulk.run('/instansi/bulk/aktif', { aktif: confirm }, confirm ? 'diaktifkan' : 'diperbarui', sel)) setConfirm(null); }} />
      )}
      {edit && <InstansiDialog item={edit === 'baru' ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function InstansiDialog({ item, onClose }: { item: Instansi | null; onClose: () => void }) {
  const [v, setV] = useState({ nama: item?.nama || '', singkatan: item?.singkatan || '', alamat: item?.alamat || '', telepon: item?.telepon || '', email: item?.email || '', aktif: item?.aktif ?? true });
  const [err, setErr] = useState('');
  const save = useAction(() => (item ? api.put(`/instansi/${item.id}`, v) : api.post('/instansi', v)), { success: item ? 'Instansi disimpan.' : 'Instansi ditambahkan.', keys: KEYS, onDone: onClose });
  const put = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={item ? `Ubah ${item.nama}` : 'Tambah instansi'} error={err || save.error?.message} confirmLabel={item ? 'Simpan perubahan' : 'Tambah instansi'} pending={save.isPending}
      onConfirm={() => { if (!v.nama.trim()) return setErr('Nama instansi wajib diisi.'); setErr(''); save.mutate(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Nama instansi" required>{(p) => <Input {...p} value={v.nama} onChange={put('nama')} />}</Field>
        <Field label="Singkatan">{(p) => <Input {...p} value={v.singkatan} onChange={put('singkatan')} />}</Field>
        <Field label="Telepon">{(p) => <Input {...p} type="tel" value={v.telepon} onChange={put('telepon')} />}</Field>
        <Field className="sm:col-span-2" label="Email">{(p) => <Input {...p} type="email" value={v.email} onChange={put('email')} />}</Field>
        <Field className="sm:col-span-2" label="Alamat">{(p) => <Textarea {...p} rows={2} value={v.alamat} onChange={put('alamat')} />}</Field>
        {item && <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2"><Checkbox checked={v.aktif} onCheckedChange={(c) => setV((s) => ({ ...s, aktif: c === true }))} /> Masih dipakai (muncul sebagai saran)</label>}
      </div>
    </ActionDialog>
  );
}
