'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ActionDialog } from '@/components/app/action-dialog';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection, type Selection } from '@/components/app/bulk';
import { Field } from '@/components/app/form-field';
import { FilterButtons } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Deadline, Stamp, StatusDisp, StatusTask } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { slaIndicator } from '@/domain/sla';
import { api } from '@/lib/api-client';
import { fmtDate, todayIso } from '@/lib/format';
import { useDispositions, useTasks, type DispRow, type TaskRow } from './api';

type View = 'disposisi' | 'tugas' | 'diberikan';
const KEYS = ['dispositions', 'tasks', 'dashboard', 'letter', 'task'];
const dispSla = (x: DispRow) => (x.deadline ? slaIndicator(x.deadline, new Date(), !['BARU', 'DITERIMA'].includes(x.status)) : null);

function Progress({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${value}%` }} /></span>
      <span className="text-sm tabular-nums">{value}%</span>
    </span>
  );
}

function DispTable({ rows, sel, onAccept, busy }: { rows: DispRow[]; sel: Selection; onAccept: (id: number) => void; busy: boolean }) {
  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-border bg-card">
      <li className="hidden items-center gap-3 bg-muted/60 px-4 py-2 text-sm font-semibold text-muted-foreground md:flex"><SelectAll sel={sel} label="Pilih semua disposisi baru" /> Pilih semua</li>
      {rows.map((x) => (
        <li key={x.id} className="flex gap-3 px-4 py-3">
          <div className="-ml-3 -mr-1 flex size-11 shrink-0 items-start justify-center pt-0.5 md:ml-0 md:mr-0 md:size-auto md:pt-1">
            {x.status === 'BARU' ? <SelectRow sel={sel} id={x.id} label={x.perihal} /> : <span className="size-[18px]" />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2"><Stamp>{x.no_agenda}</Stamp><StatusDisp status={x.status} /><Deadline sla={dispSla(x)} /></div>
            <Link href={`/surat-masuk/${x.letter_in_id}`} className="font-semibold text-foreground no-underline hover:underline">{x.perihal}</Link>
            <p className="text-sm">&ldquo;{x.instruksi}&rdquo;</p>
            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">Dari {x.dari}{x.deadline ? `, selesai ${fmtDate(x.deadline)}` : ''}.{x.tindakan.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}</div>
          </div>
          {x.status === 'BARU' && <Button size="sm" className="hidden shrink-0 sm:inline-flex" disabled={busy} onClick={() => onAccept(x.id)}>Terima</Button>}
        </li>
      ))}
    </ul>
  );
}

function TaskTable({ rows, sel, showPic }: { rows: TaskRow[]; sel: Selection; showPic?: boolean }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><SelectAll sel={sel} /></TableHead>
              <TableHead>Tugas</TableHead>
              <TableHead>{showPic ? 'Dikerjakan' : 'Dari'}</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Kemajuan</TableHead>
              <TableHead>Batas waktu</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} data-state={sel.has(t.id) ? 'selected' : undefined} className="hover:bg-muted/50">
                <TableCell><SelectRow sel={sel} id={t.id} label={t.judul} /></TableCell>
                <TableCell className="max-w-md">
                  <Link href={`/tugas/${t.id}`} className="line-clamp-2 font-semibold text-foreground no-underline hover:underline">{t.judul}</Link>
                  <span className="block truncate text-muted-foreground">{t.no_agenda} · {t.perihal}</span>
                </TableCell>
                <TableCell>{showPic ? t.pic_nama : t.assigner_nama}</TableCell>
                <TableCell><StatusTask status={t.status} /></TableCell>
                <TableCell><Progress value={t.progress} /></TableCell>
                <TableCell><Deadline sla={t.sla} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-border bg-card md:hidden">
        {rows.map((t) => (
          <li key={t.id} className="flex gap-3 px-4 py-3">
            <div className="-ml-3 -mr-1 flex size-11 shrink-0 items-start justify-center pt-0.5"><SelectRow sel={sel} id={t.id} label={t.judul} /></div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2"><StatusTask status={t.status} /><Deadline sla={t.sla} /></div>
              <Link href={`/tugas/${t.id}`} className="font-semibold text-foreground no-underline">{t.judul}</Link>
              <p className="truncate text-sm text-muted-foreground">{showPic ? t.pic_nama : `Dari ${t.assigner_nama}`} · {t.no_agenda}</p>
              <Progress value={t.progress} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

type Bulk = 'proses' | 'selesai' | 'tenggat' | 'batal' | 'terima' | null;

/** Disposisi dan tugas dalam satu tempat. Satu tampilan aktif sekaligus, jadi pilihan untuk aksi massal tidak tercampur. */
export function WorkPage() {
  const user = useUser();
  const { view, set } = useListState<View>('disposisi');
  const [done, setDone] = useState(false);
  const gives = ['superadmin', 'pimpinan', 'pejabat'].includes(user.role);
  const disp = useDispositions(done ? { scope: 'saya', status: 'DITERUSKAN,SELESAI,DIKEMBALIKAN' } : { scope: 'saya', status: 'BARU,DITERIMA' });
  const mine = useTasks(done ? { scope: 'saya', status: 'SELESAI,DIBATALKAN' } : { scope: 'saya', antrian: 'terbuka' });
  const given = useTasks(done ? { scope: 'diberikan', status: 'SELESAI,DIBATALKAN' } : { scope: 'diberikan', antrian: 'terbuka' });
  const active = view === 'disposisi' ? disp : view === 'tugas' ? mine : given;
  const items = (active.data?.items || []) as (DispRow | TaskRow)[];
  const selectable = view === 'disposisi' ? (items as DispRow[]).filter((x) => x.status === 'BARU').map((x) => x.id) : items.map((x) => x.id);
  const sel = useSelection(selectable, `${view}|${done}`);
  const bulk = useBulkAction(KEYS, (id) => { const x = items.find((r) => r.id === id); return x ? ('judul' in x ? x.judul : x.perihal) : `Data ${id}`; });
  const accept = useAction((id: number) => api.post(`/dispositions/${id}/terima`), { success: 'Disposisi diterima.', keys: KEYS });
  const [open, setOpen] = useState<Bulk>(null);
  const [deadline, setDeadline] = useState(todayIso());
  const close = () => setOpen(null);
  const views: { value: View; label: string; count?: number }[] = [
    { value: 'disposisi', label: 'Disposisi untuk saya', count: disp.data?.total },
    { value: 'tugas', label: 'Tugas saya', count: mine.data?.total },
    ...(gives ? [{ value: 'diberikan' as View, label: 'Tugas yang saya berikan', count: given.data?.total }] : []),
  ];
  return (
    <Page wide>
      <PageHeader title="Pekerjaan Saya" intro="Disposisi dan tugas untuk Anda. Yang paling dekat batas waktunya ada di atas." />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterButtons label="Jenis pekerjaan" value={view} onChange={(v) => set({ tampil: v })} options={views} />
        <FilterButtons label="Keadaan" value={done ? 'selesai' : 'belum'} onChange={(v) => setDone(v === 'selesai')} options={[{ value: 'belum', label: 'Belum selesai' }, { value: 'selesai', label: 'Sudah selesai' }]} />
      </div>

      {view === 'disposisi' && (
        <Async q={disp} isEmpty={(d) => d.items.length === 0} empty={<Empty title={done ? 'Belum ada disposisi yang selesai' : 'Tidak ada disposisi yang menunggu Anda'} text={done ? undefined : 'Disposisi baru dari pimpinan akan muncul di sini.'} />}>
          {(d) => <DispTable rows={d.items} sel={sel} onAccept={(id) => accept.mutate(id)} busy={accept.isPending} />}
        </Async>
      )}
      {view === 'tugas' && (
        <Async q={mine} isEmpty={(d) => d.items.length === 0} empty={<Empty title={done ? 'Belum ada tugas yang selesai' : 'Tidak ada tugas yang belum selesai'} />}>
          {(d) => <TaskTable rows={d.items} sel={sel} />}
        </Async>
      )}
      {view === 'diberikan' && (
        <Async q={given} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Belum ada tugas" text="Tugas yang Anda bagikan dari halaman surat akan tampil di sini." />}>
          {(d) => <TaskTable rows={d.items} sel={sel} showPic />}
        </Async>
      )}

      <BulkBar sel={sel}>
        {view === 'disposisi' && <Button size="sm" onClick={() => setOpen('terima')}>Terima disposisi</Button>}
        {view === 'tugas' && <Button size="sm" variant="outline" onClick={() => setOpen('proses')}>Tandai dikerjakan</Button>}
        {view === 'tugas' && <Button size="sm" onClick={() => setOpen('selesai')}>Tandai selesai</Button>}
        {view === 'diberikan' && <Button size="sm" variant="outline" onClick={() => setOpen('tenggat')}>Ubah batas waktu</Button>}
        {view === 'diberikan' && <Button size="sm" variant="destructive" onClick={() => setOpen('batal')}>Batalkan</Button>}
      </BulkBar>
      {bulk.dialog}

      {open === 'terima' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Terima ${sel.count} disposisi?`} confirmLabel="Terima" pending={bulk.pending}
          description="Pemberi disposisi mendapat kabar bahwa Anda sudah menerimanya."
          onConfirm={async () => { if (await bulk.run('/dispositions/bulk/terima', {}, 'diterima', sel)) close(); }} />
      )}
      {(open === 'proses' || open === 'selesai') && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={open === 'selesai' ? `Tandai ${sel.count} tugas selesai?` : `Tandai ${sel.count} tugas sedang dikerjakan?`}
          confirmLabel={open === 'selesai' ? 'Tandai selesai' : 'Tandai dikerjakan'} pending={bulk.pending}
          description={open === 'selesai' ? 'Pemberi tugas mendapat pemberitahuan. Untuk melampirkan hasil, buka tugasnya satu per satu.' : undefined}
          onConfirm={async () => { if (await bulk.run('/tasks/bulk/status', { status: open === 'selesai' ? 'SELESAI' : 'DIPROSES' }, open === 'selesai' ? 'diselesaikan' : 'diperbarui', sel)) close(); }} />
      )}
      {open === 'tenggat' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Ubah batas waktu ${sel.count} tugas`} confirmLabel="Simpan batas waktu" pending={bulk.pending}
          onConfirm={async () => { if (await bulk.run('/tasks/bulk/tenggat', { deadline }, 'diperbarui', sel)) close(); }}>
          <Field label="Batas waktu baru" required>{(p) => <Input {...p} type="date" min={todayIso()} value={deadline} onChange={(e) => setDeadline(e.target.value)} className="max-w-48" />}</Field>
        </ActionDialog>
      )}
      {open === 'batal' && (
        <ActionDialog open onOpenChange={(o) => !o && close()} title={`Batalkan ${sel.count} tugas?`} confirmLabel="Batalkan tugas" danger pending={bulk.pending}
          description="Pegawai yang mengerjakan mendapat pemberitahuan. Tugas yang dibatalkan tidak dapat dibuka lagi dari sini."
          onConfirm={async () => { if (await bulk.run('/tasks/bulk/status', { status: 'DIBATALKAN' }, 'dibatalkan', sel)) close(); }} />
      )}
    </Page>
  );
}
