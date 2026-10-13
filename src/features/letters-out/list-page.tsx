'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionDialog } from '@/components/app/action-dialog';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection, type Selection } from '@/components/app/bulk';
import { Field } from '@/components/app/form-field';
import { FilterButtons, Pager, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Stamp, StatusOut } from '@/components/app/status';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { can } from '@/domain/roles';
import { fmtDate } from '@/lib/format';
import { KEYS, useLettersOut, type LetterOutRow } from './api';

type View = 'semua' | 'saya' | 'menunggu' | 'draf' | 'kirim' | 'selesai';

const PARAMS: Record<View, Record<string, string>> = {
  semua: {}, saya: { mine: '1' }, menunggu: { antrian: 'menunggu_saya' }, draf: { status: 'DRAFT,REVISI' },
  kirim: { status: 'NOMOR_DIBERIKAN,DITANDATANGANI' }, selesai: { status: 'DIKIRIM,SELESAI' },
};

function OutTable({ rows, sel }: { rows: LetterOutRow[]; sel: Selection | null }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {sel && <TableHead className="w-10"><SelectAll sel={sel} /></TableHead>}
              <TableHead>Agenda</TableHead>
              <TableHead>Perihal dan tujuan</TableHead>
              <TableHead>Nomor surat</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden xl:table-cell">Dibuat oleh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id} data-state={sel?.has(l.id) ? 'selected' : undefined} className="hover:bg-muted/50">
                {sel && <TableCell><SelectRow sel={sel} id={l.id} label={l.perihal} /></TableCell>}
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
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-border bg-card md:hidden">
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

type Bulk = 'ajukan' | 'setuju' | 'revisi' | null;

export function LettersOutPage() {
  const user = useUser();
  const { view, q, page, set } = useListState<View>('semua');
  const query = useLettersOut({ ...PARAMS[view], q, page });
  const rows = query.data?.items || [];
  const bulkable = can.writeOut(user) || can.approve(user);
  const sel = useSelection(rows.map((r) => r.id), `${view}|${q}|${page}`);
  const bulk = useBulkAction(KEYS, (id) => rows.find((r) => r.id === id)?.perihal || `Surat ${id}`);
  const [open, setOpen] = useState<Bulk>(null);
  const [catatan, setCatatan] = useState('');
  const [err, setErr] = useState('');
  const close = () => { setOpen(null); setCatatan(''); setErr(''); };
  const options: { value: View; label: string }[] = [
    { value: 'semua', label: 'Semua' },
    ...(can.writeOut(user) ? [{ value: 'saya' as View, label: 'Buatan saya' }] : []),
    ...(can.review(user) ? [{ value: 'menunggu' as View, label: 'Menunggu keputusan saya' }] : []),
    { value: 'draf', label: 'Draf' },
    { value: 'kirim', label: 'Siap ditandatangani atau dikirim' },
    { value: 'selesai', label: 'Terkirim' },
  ];
  return (
    <Page wide>
      <PageHeader title="Surat Keluar" intro="Dari draf, persetujuan pimpinan, penomoran, tanda tangan, sampai dikirim.">
        {can.writeOut(user) && <Button asChild><Link href="/surat-keluar/baru"><PlusIcon aria-hidden /> Buat Surat Keluar</Link></Button>}
      </PageHeader>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterButtons label="Tampilkan surat" options={options} value={view} onChange={(v) => set({ tampil: v })} />
        <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari surat keluar" placeholder="Nomor, perihal, atau tujuan" />
      </div>
      <Async q={query} isEmpty={(d) => d.items.length === 0}
        empty={<Empty title={q || view !== 'semua' ? 'Tidak ada surat yang cocok' : 'Belum ada surat keluar'} text={can.writeOut(user) ? 'Buat surat dari template dengan tombol Buat Surat Keluar.' : undefined} />}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <OutTable rows={d.items} sel={bulkable ? sel : null} />
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => { set({ halaman: p }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      </Async>

      <BulkBar sel={sel}>
        {can.writeOut(user) && <Button size="sm" variant="outline" onClick={() => setOpen('ajukan')}>Ajukan persetujuan</Button>}
        {can.approve(user) && <Button size="sm" onClick={() => setOpen('setuju')}>Setujui dan beri nomor</Button>}
        {can.approve(user) && <Button size="sm" variant="outline" onClick={() => setOpen('revisi')}>Kembalikan untuk revisi</Button>}
      </BulkBar>
      {bulk.dialog}

      {open === 'ajukan' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Ajukan ${sel.count} surat untuk persetujuan?`} confirmLabel="Ajukan" pending={bulk.pending}
          description="Hanya draf atau surat yang sedang direvisi yang dapat diajukan. Yang lain dilewati."
          onConfirm={async () => { if (await bulk.run('/letters-out/bulk/ajukan', {}, 'diajukan', sel)) close(); }} />
      )}
      {open === 'setuju' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Setujui ${sel.count} surat?`} confirmLabel="Setujui dan beri nomor" pending={bulk.pending}
          description="Setiap surat mendapat nomor urut berikutnya. Nomor yang sudah diberikan tidak dapat dibatalkan."
          onConfirm={async () => { if (await bulk.run('/letters-out/bulk/keputusan', { aksi: 'setuju', catatan }, 'disetujui', sel)) close(); }}>
          <Field label="Catatan untuk pembuat surat">{(p) => <Textarea {...p} rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
        </ActionDialog>
      )}
      {open === 'revisi' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Kembalikan ${sel.count} surat untuk revisi?`} confirmLabel="Kembalikan" pending={bulk.pending} error={err}
          onConfirm={async () => { if (!catatan.trim()) return setErr('Tulis apa yang perlu diperbaiki.'); setErr(''); if (await bulk.run('/letters-out/bulk/keputusan', { aksi: 'revisi', catatan }, 'dikembalikan', sel)) close(); }}>
          <Field label="Yang perlu diperbaiki" required>{(p) => <Textarea {...p} rows={3} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
        </ActionDialog>
      )}
    </Page>
  );
}
