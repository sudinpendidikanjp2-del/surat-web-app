'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FilePenLineIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionDialog } from '@/components/app/action-dialog';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection, type Selection } from '@/components/app/bulk';
import { Field } from '@/components/app/form-field';
import { FilterButtons, SearchForm } from '@/components/app/list-controls';
import { ExportMenu, FilterPanel, PagerFull, SortHead } from '@/components/app/data-table';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { REF_KATEGORI } from '@/domain/reference';
import { useRefValues } from '@/features/reference/api';
import { Page, PageHeader, Panel } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Stamp, StatusOut } from '@/components/app/status';
import { useListState, type ListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { can } from '@/domain/roles';
import { fmtDate, todayIso } from '@/lib/format';
import { METODE_KIRIM } from '@/domain/letter-out';
import { KEYS, useLettersOut, type LetterOutRow } from './api';

type View = 'semua' | 'saya' | 'belum' | 'lengkapi' | 'terkirim' | 'batal';

const PARAMS: Record<View, Record<string, string>> = {
  semua: {}, saya: { mine: '1' }, belum: { status: 'DICATAT' }, lengkapi: { status: 'DICATAT', antrian: 'belum_lengkap' },
  terkirim: { status: 'DIKIRIM' }, batal: { status: 'DIBATALKAN' },
};

function OutTable({ rows, sel, ls }: { rows: LetterOutRow[]; sel: Selection | null; ls: ListState }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {sel && <TableHead className="w-12 pl-5"><SelectAll sel={sel} /></TableHead>}
              <SortHead col="agenda" ls={ls}>Agenda</SortHead>
              <SortHead col="perihal" ls={ls}>Perihal dan tujuan</SortHead>
              <SortHead col="nomor" ls={ls}>Nomor surat</SortHead>
              <SortHead col="tgl" ls={ls}>Tanggal</SortHead>
              <SortHead col="status" ls={ls}>Status</SortHead>
              <TableHead className="hidden xl:table-cell">Dibuat oleh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id} data-state={sel?.has(l.id) ? 'selected' : undefined} className="hover:bg-muted/50">
                {sel && <TableCell className="pl-5"><SelectRow sel={sel} id={l.id} label={l.perihal} /></TableCell>}
                <TableCell className="whitespace-nowrap"><Stamp>{l.no_agenda}</Stamp></TableCell>
                <TableCell className="max-w-md">
                  <Link href={`/surat-keluar/${l.id}`} className="line-clamp-2 font-semibold text-foreground no-underline hover:underline">{l.perihal}</Link>
                  <span className="block truncate text-muted-foreground">Kepada {l.tujuan}{l.asal_agenda ? ` · balasan ${l.asal_agenda}` : ''}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{l.nomor_surat || <span className="text-muted-foreground">Belum bernomor</span>}</TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(l.tgl_surat)}</TableCell>
                <TableCell><StatusOut status={l.status} /></TableCell>
                <TableCell className="hidden xl:table-cell">{l.pembuat}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col divide-y divide-line md:hidden">
        {rows.map((l) => (
          <li key={l.id} className="flex gap-3 px-4 py-3">
            {sel && <div className="-ml-3 -mr-1 flex size-11 shrink-0 items-start justify-center pt-0.5"><SelectRow sel={sel} id={l.id} label={l.perihal} /></div>}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2"><Stamp>{l.no_agenda}</Stamp><StatusOut status={l.status} /></div>
              <Link href={`/surat-keluar/${l.id}`} className="font-semibold text-foreground no-underline">{l.perihal}</Link>
              <p className="truncate text-sm text-muted-foreground">Kepada {l.tujuan}</p>
              <p className="text-sm text-muted-foreground">{l.nomor_surat || 'Belum bernomor'} · {fmtDate(l.tgl_surat)}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type Bulk = 'kirim' | null;

export function LettersOutPage() {
  const user = useUser();
  const ls = useListState<View>('semua', { sort: 'dibuat', dir: 'desc' });
  const { view, q, page, size, sort, dir, filters, set } = ls;
  const jenisList = useRefValues('jenis_surat', REF_KATEGORI.jenis_surat.defaults);
  const apiParams = { ...PARAMS[view], q, page, pageSize: size, sort, dir, from: filters.dari, to: filters.sampai, jenis: filters.jenis };
  const query = useLettersOut(apiParams);
  const [f, setF] = useState({ dari: '', sampai: '', jenis: '', ...filters });
  const rows = query.data?.items || [];
  const bulkable = can.writeOut(user);
  const metodeKirim = useRefValues('metode_kirim', METODE_KIRIM);
  const [metode, setMetode] = useState('Surat resmi');
  const [tanggal, setTanggal] = useState(todayIso());
  const sel = useSelection(rows.map((r) => r.id), `${view}|${q}|${page}|${JSON.stringify(filters)}`);
  const bulk = useBulkAction(KEYS, (id) => rows.find((r) => r.id === id)?.perihal || `Surat ${id}`);
  const [open, setOpen] = useState<Bulk>(null);
  const [catatan, setCatatan] = useState('');
  const close = () => { setOpen(null); setCatatan(''); };
  const options: { value: View; label: string }[] = [
    { value: 'semua', label: 'Semua' },
    ...(can.writeOut(user) ? [{ value: 'saya' as View, label: 'Catatan saya' }] : []),
    { value: 'belum', label: 'Belum dikirim' },
    { value: 'lengkapi', label: 'Perlu dilengkapi' },
    { value: 'terkirim', label: 'Terkirim' },
    { value: 'batal', label: 'Dibatalkan' },
  ];
  return (
    <Page wide>
      <PageHeader title="Surat Keluar" intro="Catatan surat yang sudah ditandatangani: nomor, tujuan, pindaian, dan pengirimannya. Untuk menyusun surat dari template, pakai Buat Surat.">
        <ExportMenu path="/letters-out" params={apiParams} />
        {can.writeOut(user) && <Button asChild variant="outline"><Link href="/buat-surat"><FilePenLineIcon aria-hidden /> Buat Surat</Link></Button>}
        {can.writeOut(user) && <Button asChild><Link href="/surat-keluar/baru"><PlusIcon aria-hidden /> Catat Surat Keluar</Link></Button>}
      </PageHeader>
      <Panel>
        <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center xl:justify-between">
          <FilterButtons label="Tampilkan surat" options={options} value={view} onChange={(v) => set({ tampil: v })} />
          <div className="flex flex-wrap items-center gap-2">
            <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari surat keluar" placeholder="Nomor, perihal, atau tujuan" className="sm:w-80" />
            <FilterPanel count={ls.filterCount} onReset={() => { setF({ dari: '', sampai: '', jenis: '' }); set({ dari: '', sampai: '', jenis: '' }); }} onApply={() => set({ ...f })}>
              <Field label="Tanggal surat dari">{(p) => <Input {...p} type="date" value={f.dari} onChange={(e) => setF({ ...f, dari: e.target.value })} />}</Field>
              <Field label="Sampai tanggal">{(p) => <Input {...p} type="date" value={f.sampai} onChange={(e) => setF({ ...f, sampai: e.target.value })} />}</Field>
              <Field className="sm:col-span-2" label="Jenis surat">{(p) => <NativeSelect {...p} value={f.jenis} onChange={(e) => setF({ ...f, jenis: e.target.value })}><option value="">Semua jenis</option>{jenisList.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
            </FilterPanel>
          </div>
        </div>
        <Async q={query} isEmpty={(d) => d.items.length === 0}
          empty={<div className="p-4"><Empty title={q || view !== 'semua' || ls.filterCount ? 'Tidak ada surat yang cocok' : 'Belum ada surat keluar'} text={can.writeOut(user) ? 'Catat surat yang sudah ditandatangani dengan tombol Catat Surat Keluar.' : undefined} /></div>}>
          {(d) => (
            <div className="flex flex-col">
              <OutTable rows={d.items} sel={bulkable ? sel : null} ls={ls} />
              <div className="border-t border-line p-4"><PagerFull page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => { set({ halaman: p }); window.scrollTo({ top: 0 }); }} onSize={(n) => set({ baris: n })} /></div>
            </div>
          )}
        </Async>
      </Panel>

      <BulkBar sel={sel}>
        {can.writeOut(user) && <Button size="sm" onClick={() => setOpen('kirim')}>Catat pengiriman</Button>}
      </BulkBar>
      {bulk.dialog}

      {open === 'kirim' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Catat pengiriman ${sel.count} surat?`} confirmLabel="Simpan Catatan Pengiriman" pending={bulk.pending}
          description="Hanya surat yang bernomor, sudah ada pindaian bertanda tangannya, dan belum dikirim yang dicatat. Yang lain dilewati dengan alasannya."
          onConfirm={async () => { if (await bulk.run('/letters-out/bulk/kirim', { metode, tanggal, catatan }, 'dicatat terkirim', sel)) close(); }}>
          <Field label="Dikirim lewat" required>{(p) => <NativeSelect {...p} value={metode} onChange={(e) => setMetode(e.target.value)}>{metodeKirim.map((m) => <option key={m}>{m}</option>)}</NativeSelect>}</Field>
          <Field label="Tanggal dikirim" required>{(p) => <Input {...p} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />}</Field>
          <Field label="Catatan">{(p) => <Textarea {...p} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
        </ActionDialog>
      )}
    </Page>
  );
}
