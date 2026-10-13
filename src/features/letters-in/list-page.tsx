'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionDialog } from '@/components/app/action-dialog';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection, type Selection } from '@/components/app/bulk';
import { FilterButtons, Pager, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Deadline, Stamp, StatusIn } from '@/components/app/status';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { can } from '@/domain/roles';
import { fmtDate } from '@/lib/format';
import { useLettersIn, KEYS, type LetterInRow } from './api';
import { checkDispose, DisposeFields, emptyDispose } from './dialogs';

type View = 'semua' | 'perlu' | 'proses' | 'terlambat' | 'selesai';

const PROSES = 'MENUNGGU_DISPOSISI,DIDISPOSISIKAN,SEDANG_DIPROSES,MENUNGGU_KONFIRMASI,MENUNGGU_PERSETUJUAN';

function paramsFor(view: View, role: string): Record<string, string> {
  if (view === 'perlu') return role === 'tu' ? { antrian: 'belum_diteruskan' } : { status: 'MENUNGGU_DISPOSISI' };
  if (view === 'proses') return { status: PROSES };
  if (view === 'terlambat') return { antrian: 'terlambat' };
  if (view === 'selesai') return { status: 'SELESAI,DIARSIPKAN' };
  return {};
}

const position = (l: LetterInRow) => l.pic || (l.status === 'DITERIMA' ? 'Tata Usaha' : l.status === 'MENUNGGU_DISPOSISI' ? 'Pimpinan' : '-');
const from = (l: LetterInRow) => `${l.asal}${l.instansi ? `, ${l.instansi}` : ''}`;

/** Tabel di layar lebar (pindai banyak surat sekaligus), kartu ringkas di ponsel. */
function LetterTable({ rows, sel }: { rows: LetterInRow[]; sel: Selection | null }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {sel && <TableHead className="w-10"><SelectAll sel={sel} /></TableHead>}
              <TableHead>Agenda</TableHead>
              <TableHead>Perihal dan pengirim</TableHead>
              <TableHead>Diterima</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Batas waktu</TableHead>
              <TableHead className="hidden xl:table-cell">Sekarang di</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => (
              <TableRow key={l.id} data-state={sel?.has(l.id) ? 'selected' : undefined} className="hover:bg-muted/50">
                {sel && <TableCell><SelectRow sel={sel} id={l.id} label={l.perihal} /></TableCell>}
                <TableCell className="whitespace-nowrap"><Stamp>{l.no_agenda}</Stamp></TableCell>
                <TableCell className="max-w-md">
                  <Link href={`/surat-masuk/${l.id}`} className="line-clamp-2 font-semibold text-foreground no-underline hover:underline">{l.perihal}</Link>
                  <span className="block truncate text-muted-foreground">{from(l)}{l.sifat !== 'Biasa' ? ` · ${l.sifat}` : ''}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{fmtDate(l.tgl_diterima)}</TableCell>
                <TableCell><StatusIn status={l.status} /></TableCell>
                <TableCell><Deadline sla={l.sla} /></TableCell>
                <TableCell className="hidden xl:table-cell">{position(l)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-border bg-card md:hidden">
        {rows.map((l) => (
          <li key={l.id} className="flex gap-3 px-4 py-3" data-state={sel?.has(l.id) ? 'selected' : undefined}>
            {sel && <div className="flex size-11 shrink-0 items-start justify-center pt-0.5 -ml-3 -mr-1"><SelectRow sel={sel} id={l.id} label={l.perihal} /></div>}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2"><Stamp>{l.no_agenda}</Stamp><StatusIn status={l.status} /></div>
              <Link href={`/surat-masuk/${l.id}`} className="font-semibold text-foreground no-underline">{l.perihal}</Link>
              <p className="truncate text-sm text-muted-foreground">{from(l)}</p>
              <p className="flex flex-wrap gap-x-3 text-sm"><span className="text-muted-foreground">Diterima {fmtDate(l.tgl_diterima)}</span><Deadline sla={l.sla} /></p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type Bulk = 'teruskan' | 'arsip' | 'disposisi' | null;

export function LettersInPage() {
  const user = useUser();
  const { view, q, page, set } = useListState<View>('semua');
  const query = useLettersIn({ ...paramsFor(view, user.role), q, page });
  const rows = query.data?.items || [];
  const bulkable = can.manageIn(user) || can.dispose(user);
  const sel = useSelection(rows.map((r) => r.id), `${view}|${q}|${page}`);
  const bulk = useBulkAction(KEYS, (id) => rows.find((r) => r.id === id)?.perihal || `Surat ${id}`);
  const [open, setOpen] = useState<Bulk>(null);
  const [disp, setDisp] = useState(emptyDispose());
  const [err, setErr] = useState('');
  const close = () => { setOpen(null); setErr(''); };
  const options: { value: View; label: string }[] = [
    { value: 'semua', label: 'Semua' },
    ...(can.manageIn(user) ? [{ value: 'perlu' as View, label: 'Belum diteruskan' }] : can.dispose(user) ? [{ value: 'perlu' as View, label: 'Menunggu disposisi saya' }] : []),
    { value: 'proses', label: 'Dalam proses' },
    { value: 'terlambat', label: 'Terlambat' },
    { value: 'selesai', label: 'Selesai' },
  ];
  return (
    <Page wide>
      <PageHeader title="Surat Masuk" intro="Surat yang diterima kantor, beserta posisi dan batas waktunya.">
        {can.manageIn(user) && <Button asChild><Link href="/surat-masuk/baru"><PlusIcon aria-hidden /> Catat Surat Masuk</Link></Button>}
      </PageHeader>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterButtons label="Tampilkan surat" options={options} value={view} onChange={(v) => set({ tampil: v })} />
        <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari surat masuk" placeholder="Nomor, perihal, atau pengirim" />
      </div>
      <Async q={query} isEmpty={(d) => d.items.length === 0} loadingLabel="Memuat daftar surat…"
        empty={q || view !== 'semua'
          ? <Empty title="Tidak ada surat yang cocok" text="Coba kata lain, atau tampilkan semua surat." action={<Button variant="outline" size="sm" onClick={() => set({ tampil: 'semua', q: '' })}>Tampilkan semua</Button>} />
          : <Empty title="Belum ada surat masuk" text={can.manageIn(user) ? 'Catat surat pertama dengan tombol Catat Surat Masuk.' : 'Surat yang dicatat Tata Usaha akan tampil di sini.'} />}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <LetterTable rows={d.items} sel={bulkable ? sel : null} />
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => { set({ halaman: p }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      </Async>

      <BulkBar sel={sel}>
        {can.manageIn(user) && <Button size="sm" onClick={() => setOpen('teruskan')}>Teruskan ke pimpinan</Button>}
        {can.dispose(user) && <Button size="sm" onClick={() => { setDisp(emptyDispose()); setOpen('disposisi'); }}>Beri disposisi</Button>}
        {can.manageIn(user) && <Button size="sm" variant="outline" onClick={() => setOpen('arsip')}>Arsipkan</Button>}
      </BulkBar>
      {bulk.dialog}

      {open === 'teruskan' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Teruskan ${sel.count} surat ke pimpinan?`} confirmLabel="Teruskan" pending={bulk.pending}
          description="Pimpinan mendapat pemberitahuan untuk memberi disposisi. Surat yang sudah diteruskan dilewati."
          onConfirm={async () => { if (await bulk.run('/letters-in/bulk/teruskan', {}, 'diteruskan', sel)) close(); }} />
      )}
      {open === 'arsip' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Arsipkan ${sel.count} surat?`} confirmLabel="Arsipkan" pending={bulk.pending}
          description="Hanya surat yang sudah selesai yang dapat diarsipkan. Surat lain dilewati dan dilaporkan."
          onConfirm={async () => { if (await bulk.run('/letters-in/bulk/arsipkan', {}, 'diarsipkan', sel)) close(); }} />
      )}
      {open === 'disposisi' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Beri disposisi untuk ${sel.count} surat`} confirmLabel="Kirim disposisi" pending={bulk.pending} error={err}
          description="Penerima, tindakan, dan instruksi yang sama untuk semua surat terpilih."
          onConfirm={async () => { const e = checkDispose(disp); setErr(e); if (!e && await bulk.run('/letters-in/bulk/disposisi', { ...disp }, 'didisposisikan', sel)) close(); }}>
          <DisposeFields f={disp} setF={setDisp} />
        </ActionDialog>
      )}
    </Page>
  );
}
