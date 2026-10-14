'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ActionDialog } from '@/components/app/action-dialog';
import { FileList } from '@/components/app/file-list';
import { FilePicker } from '@/components/app/file-picker';
import { ChoiceRow, Choices, Field } from '@/components/app/form-field';
import { NextStep } from '@/components/app/next-step';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async } from '@/components/app/states';
import { Deadline, Stamp, StatusTask } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import { PRIORITAS } from '@/domain/letter-in';
import { TASK_STATUS } from '@/domain/task';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useUserOptions } from '@/features/letters-in/api';
import { useTask, type TaskDetail } from './api';

const KEYS = ['task', 'tasks', 'dashboard', 'letter', 'timeline'];

/** Pilihan keadaan dalam kata sehari-hari. Kemajuan dipilih dengan tombol besar, bukan penggeser yang sulit diatur. */
const STATUS_CHOICES = [
  { value: 'DIPROSES', label: 'Sedang saya kerjakan' },
  { value: 'MENUNGGU_DATA', label: 'Saya menunggu data dari orang lain' },
  { value: 'SELESAI', label: 'Sudah selesai' },
];
const STEPS = [0, 25, 50, 75, 100];

function ProgressDialog({ d, open, onOpenChange }: { d: TaskDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = d.task;
  const [status, setStatus] = useState(['BELUM_DIMULAI', 'DITERIMA'].includes(t.status) ? 'DIPROSES' : t.status);
  const [progress, setProgress] = useState(Math.round(t.progress / 25) * 25);
  const [catatan, setCatatan] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const act = useAction(() => api.upload(`/tasks/${t.id}/update`, { status, progress: status === 'SELESAI' ? 100 : progress, catatan }, { files }), {
    success: status === 'SELESAI' ? 'Tugas sudah dilaporkan selesai. Pemberi tugas mendapat pemberitahuan.' : 'Kemajuan sudah dilaporkan.', keys: KEYS, onDone: () => onOpenChange(false),
  });
  const choices = d.can.batal ? [...STATUS_CHOICES, { value: 'DIBATALKAN', label: 'Batalkan tugas ini' }] : STATUS_CHOICES;
  return (
    <ActionDialog open={open} onOpenChange={onOpenChange} title="Laporkan kemajuan" description={t.judul} error={err}
      confirmLabel={status === 'SELESAI' ? 'Laporkan Selesai' : 'Simpan Laporan'} pending={act.isPending}
      onConfirm={() => {
        if (status === 'MENUNGGU_DATA' && !catatan.trim()) return setErr('Tulis data apa yang Anda tunggu, supaya pemberi tugas bisa membantu.');
        if (status === 'DIBATALKAN' && !catatan.trim()) return setErr('Tulis alasan pembatalan.');
        setErr(''); act.mutate();
      }}>
      <Choices legend="1. Keadaan tugas sekarang">
        <RadioGroup value={status} onValueChange={setStatus}>
          {choices.map((c) => <ChoiceRow key={c.value}><RadioGroupItem value={c.value} /><span>{c.label}</span></ChoiceRow>)}
        </RadioGroup>
      </Choices>
      {status !== 'SELESAI' && status !== 'DIBATALKAN' && (
        <Choices legend="2. Berapa persen yang sudah selesai">
          <div role="group" className="grid grid-cols-5 gap-2">
            {STEPS.map((p) => (
              <button key={p} type="button" aria-pressed={progress === p} onClick={() => setProgress(p)}
                className={`pressable h-11 cursor-pointer rounded-md border text-sm font-semibold tabular-nums sm:h-10 ${progress === p ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>{p}%</button>
            ))}
          </div>
        </Choices>
      )}
      <Field label={status === 'MENUNGGU_DATA' ? 'Data apa yang Anda tunggu' : status === 'DIBATALKAN' ? 'Alasan pembatalan' : 'Catatan'} required={status === 'MENUNGGU_DATA' || status === 'DIBATALKAN'}>
        {(p) => <Textarea {...p} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: Data kelas 1 sampai 5 sudah direkap." />}
      </Field>
      <div className="flex flex-col gap-1.5"><span className="text-sm font-semibold">File hasil pekerjaan</span>
        <FilePicker files={files} onChange={setFiles} accept=".pdf,.docx,.xlsx,.xls,.doc,.png,.jpg,.jpeg,.csv,.txt" /></div>
    </ActionDialog>
  );
}

function EditDialog({ d, open, onOpenChange }: { d: TaskDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = d.task;
  const users = useUserOptions();
  const [f, setF] = useState({ judul: t.judul, deskripsi: t.deskripsi || '', deadline: t.deadline?.slice(0, 10) || '', prioritas: t.prioritas, pic_user_id: String(t.pic_user_id) });
  const act = useAction(() => api.put(`/tasks/${t.id}`, { ...f, pic_user_id: Number(f.pic_user_id) }), { success: 'Tugas sudah diperbarui.', keys: KEYS, onDone: () => onOpenChange(false) });
  return (
    <ActionDialog open={open} onOpenChange={onOpenChange} title="Ubah tugas" confirmLabel="Simpan Perubahan" pending={act.isPending} onConfirm={() => act.mutate()}>
      <Field label="Judul tugas" required>{(p) => <Input {...p} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} />}</Field>
      <Field label="Siapa yang mengerjakan" required>{(p) => <NativeSelect {...p} value={f.pic_user_id} onChange={(e) => setF({ ...f, pic_user_id: e.target.value })}>{(users.data || []).filter((u) => u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}</NativeSelect>}</Field>
      <Field label="Harus selesai paling lambat" required>{(p) => <Input {...p} type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}</Field>
      <Field label="Seberapa mendesak" required>{(p) => <NativeSelect {...p} value={f.prioritas} onChange={(e) => setF({ ...f, prioritas: e.target.value })}>{PRIORITAS.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
      <Field label="Penjelasan">{(p) => <Textarea {...p} value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} />}</Field>
    </ActionDialog>
  );
}

function Detail({ d }: { d: TaskDetail }) {
  const t = d.task;
  const [dlg, setDlg] = useState<'progress' | 'edit' | null>(null);
  const [local, setLocal] = useState<TaskDetail['task']['checklist'] | null>(null);
  const toggle = useAction((list: TaskDetail['task']['checklist']) => api.upload(`/tasks/${t.id}/update`, { checklist: list }), { keys: ['task', 'tasks', 'dashboard'], onDone: () => setLocal(null) });
  const list = local ?? t.checklist;
  const flip = (i: number) => { const next = list.map((x, j) => (j === i ? { ...x, selesai: !x.selesai } : x)); setLocal(next); toggle.mutate(next, { onError: () => setLocal(null) }); };
  const closed = ['SELESAI', 'DIBATALKAN'].includes(t.status);
  return (
    <>
      <PageHeader back={{ href: '/pekerjaan', label: 'Pekerjaan Saya' }} title={t.judul}
        meta={<><Stamp>{t.no_agenda}</Stamp><StatusTask status={t.status} /><Deadline sla={t.sla} /></>}>
        {d.can.edit && <Button variant="outline" onClick={() => setDlg('edit')}>Ubah tugas</Button>}
        <Button asChild variant="outline"><Link href={`/surat-masuk/${t.letter_in_id}`}>Buka surat asal</Link></Button>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          <NextStep step={closed ? { quiet: true, title: t.status === 'SELESAI' ? 'Tugas ini sudah selesai' : 'Tugas ini dibatalkan' } : d.can.update
            ? { title: 'Laporkan kemajuan pekerjaan Anda', desc: 'Pemberi tugas mendapat kabar setiap kali Anda melapor.', primary: { label: 'Laporkan kemajuan', onClick: () => setDlg('progress') } }
            : { quiet: true, title: 'Anda dapat melihat tugas ini', desc: 'Hanya penanggung jawab dan pemberi tugas yang dapat melaporkan kemajuan.' }} />

          {t.deskripsi && <Section title="Penjelasan"><p className="whitespace-pre-wrap rounded-2xl border border-border bg-card shadow-(--shadow-card) px-4 py-3">{t.deskripsi}</p></Section>}

          {list.length > 0 && (
            <Section title="Daftar langkah" intro={d.can.update ? 'Centang langkah yang selesai. Tersimpan otomatis.' : undefined}
              action={<span className="text-sm text-muted-foreground">{list.filter((c) => c.selesai).length} dari {list.length}</span>}>
              <div className="flex flex-col gap-1.5">
                {list.map((c, i) => (
                  <ChoiceRow key={i}><Checkbox checked={c.selesai} disabled={!d.can.update} onCheckedChange={() => flip(i)} /><span className={c.selesai ? 'text-muted-foreground line-through' : ''}>{c.teks}</span></ChoiceRow>
                ))}
              </div>
            </Section>
          )}

          <Section title="Hasil pekerjaan"><FileList files={d.attachments} empty="Belum ada file hasil." /></Section>

          <Section title="Riwayat laporan">
            {d.updates.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada laporan kemajuan.</p> : (
              <ol className="flex flex-col rounded-2xl border border-border bg-card shadow-(--shadow-card) px-4 py-1">
                {d.updates.map((u) => (
                  <li key={u.id} className="flex flex-col gap-0.5 border-t border-line py-3 text-sm first:border-t-0">
                    <span className="font-semibold">{TASK_STATUS[u.status as keyof typeof TASK_STATUS] || u.status}, {u.progress}%</span>
                    <span className="text-muted-foreground">{fmtDateTime(u.created_at)}, {u.user_nama}</span>
                    {u.catatan && <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted px-3 py-2">{u.catatan}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title="Rincian">
            <Card><CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="flex items-baseline justify-between text-sm"><span className="text-muted-foreground">Kemajuan</span><span className="text-lg font-bold tabular-nums">{t.progress}%</span></p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan tugas">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${t.progress}%` }} />
                </div>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                {([['Dikerjakan oleh', t.pic_nama], ['Diberikan oleh', t.assigner_nama], ['Batas waktu', fmtDate(t.deadline)], ['Prioritas', t.prioritas]] as const).map(([k, v]) => (
                  <div key={k} className="flex flex-col"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>
                ))}
                <div className="flex flex-col"><dt className="text-muted-foreground">Surat</dt><dd><Link href={`/surat-masuk/${t.letter_in_id}`}>{t.perihal}</Link></dd></div>
              </dl>
            </CardContent></Card>
          </Section>
        </aside>
      </div>
      {dlg === 'progress' && <ProgressDialog d={d} open onOpenChange={(o) => !o && setDlg(null)} />}
      {dlg === 'edit' && <EditDialog d={d} open onOpenChange={(o) => !o && setDlg(null)} />}
    </>
  );
}

export function TaskDetailPage({ id }: { id: string }) {
  const q = useTask(id);
  return <Page wide><Async q={q} isEmpty={() => false} loadingLabel="Membuka tugas…">{(d) => <Detail d={d} />}</Async></Page>;
}
