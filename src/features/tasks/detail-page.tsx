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
                className={`min-h-[56px] cursor-pointer rounded-md border-2 text-lg font-bold ${progress === p ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>{p}%</button>
            ))}
          </div>
        </Choices>
      )}
      <Field label={status === 'MENUNGGU_DATA' ? 'Data apa yang Anda tunggu' : status === 'DIBATALKAN' ? 'Alasan pembatalan' : 'Catatan'} required={status === 'MENUNGGU_DATA' || status === 'DIBATALKAN'}>
        {(p) => <Textarea {...p} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: Data kelas 1 sampai 5 sudah direkap." />}
      </Field>
      <div className="flex flex-col gap-2"><span className="font-bold">File hasil pekerjaan <span className="font-normal text-muted-foreground">(boleh dikosongkan)</span></span>
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
      <PageHeader back={{ href: '/pekerjaan', label: 'Kembali ke Pekerjaan Saya' }} title={t.judul}>
        <div className="flex flex-wrap items-center gap-2"><Stamp>{t.no_agenda}</Stamp><StatusTask status={t.status} /><Deadline sla={t.sla} /></div>
      </PageHeader>
      <NextStep step={closed ? { quiet: true, title: t.status === 'SELESAI' ? 'Tugas ini sudah selesai' : 'Tugas ini dibatalkan' } : d.can.update
        ? { title: 'Laporkan kemajuan pekerjaan Anda', desc: 'Pilih keadaan dan persentase. Pemberi tugas akan mendapat kabar.', primary: { label: 'Laporkan Kemajuan', onClick: () => setDlg('progress') } }
        : { quiet: true, title: 'Anda dapat melihat tugas ini', desc: 'Hanya penanggung jawab dan pemberi tugas yang dapat melaporkan kemajuan.' }} />
      <div className="flex flex-wrap gap-3 no-print">
        {d.can.edit && <Button variant="outline" onClick={() => setDlg('edit')}>Ubah Tugas</Button>}
        <Button asChild variant="outline" className="no-underline"><Link href={`/surat-masuk/${t.letter_in_id}`}>Buka Surat Asalnya</Link></Button>
      </div>

      <Section title="Rincian tugas">
        <Card><CardContent className="flex flex-col gap-5">
          <dl className="grid gap-x-8 gap-y-3 text-lg sm:grid-cols-[220px_1fr]">
            <dt className="text-muted-foreground">Dikerjakan oleh</dt><dd className="font-semibold">{t.pic_nama}</dd>
            <dt className="text-muted-foreground">Diberikan oleh</dt><dd className="font-semibold">{t.assigner_nama}</dd>
            <dt className="text-muted-foreground">Batas waktu</dt><dd className="font-semibold">{fmtDate(t.deadline)}</dd>
            <dt className="text-muted-foreground">Seberapa mendesak</dt><dd className="font-semibold">{t.prioritas}</dd>
            <dt className="text-muted-foreground">Surat</dt><dd><Link href={`/surat-masuk/${t.letter_in_id}`}>{t.perihal}</Link></dd>
          </dl>
          {t.deskripsi && <p className="whitespace-pre-wrap text-lg">{t.deskripsi}</p>}
          <div className="flex flex-col gap-2">
            <p className="text-lg font-bold">Kemajuan: {t.progress}%</p>
            <div className="h-5 w-full overflow-hidden rounded-sm border-2 border-input bg-card" role="progressbar" aria-valuenow={t.progress} aria-valuemin={0} aria-valuemax={100} aria-label="Kemajuan tugas">
              <div className="h-full bg-primary" style={{ width: `${t.progress}%` }} />
            </div>
          </div>
        </CardContent></Card>
      </Section>

      {list.length > 0 && (
        <Section title="Daftar langkah" intro={d.can.update ? 'Centang langkah yang sudah selesai. Tersimpan otomatis.' : undefined}>
          <div className="flex flex-col gap-2">
            {list.map((c, i) => (
              <ChoiceRow key={i}><Checkbox checked={c.selesai} disabled={!d.can.update} onCheckedChange={() => flip(i)} /><span className={c.selesai ? 'line-through' : ''}>{c.teks}</span></ChoiceRow>
            ))}
          </div>
        </Section>
      )}

      <Section title="Hasil pekerjaan"><FileList files={d.attachments} empty="Belum ada file hasil." /></Section>

      <Section title="Riwayat laporan">
        {d.updates.length === 0 ? <p className="text-muted-foreground">Belum ada laporan kemajuan.</p> : (
          <ol className="flex flex-col">
            {d.updates.map((u) => (
              <li key={u.id} className="flex flex-col gap-1 border-t-2 border-[#e4e0d6] py-4 first:border-t-0 first:pt-0">
                <span className="text-muted-foreground">{fmtDateTime(u.created_at)}, oleh {u.user_nama}</span>
                <span className="text-lg font-semibold">{TASK_STATUS[u.status as keyof typeof TASK_STATUS] || u.status}, kemajuan {u.progress}%</span>
                {u.catatan && <p className="whitespace-pre-wrap rounded-md bg-muted px-4 py-3">{u.catatan}</p>}
              </li>
            ))}
          </ol>
        )}
      </Section>
      {dlg === 'progress' && <ProgressDialog d={d} open onOpenChange={(o) => !o && setDlg(null)} />}
      {dlg === 'edit' && <EditDialog d={d} open onOpenChange={(o) => !o && setDlg(null)} />}
    </>
  );
}

export function TaskDetailPage({ id }: { id: string }) {
  const q = useTask(id);
  return <Page><Async q={q} isEmpty={() => false} loadingLabel="Sedang membuka tugas…">{(d) => <Detail d={d} />}</Async></Page>;
}
