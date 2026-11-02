'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ActionDialog } from '@/components/app/action-dialog';
import { Discussion } from '@/components/app/discussion';
import { FileList } from '@/components/app/file-list';
import { FilePicker } from '@/components/app/file-picker';
import { ChoiceRow, Choices, Field } from '@/components/app/form-field';
import { NextStep, OtherActions, type NextStepInfo } from '@/components/app/next-step';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Loading } from '@/components/app/states';
import { Stamp, StatusOut } from '@/components/app/status';
import { Steps } from '@/components/app/steps';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import { METODE_KIRIM } from '@/domain/letter-out';
import { useRefValues } from '@/features/reference/api';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { useUserOptions } from '@/features/letters-in/api';
import { KEYS, useLetterOut, type LetterOutDetail } from './api';
import { LetterForm } from './letter-form';

type Dlg = 'edit' | 'review' | 'decide' | 'sign' | 'send' | 'upload' | null;

/** Tahap dan status pertama yang menandai tahap itu sudah dilewati. */
const FLOW = [['draf', 'Draf dibuat', 'DRAFT'], ['setuju', 'Disetujui pimpinan', 'DISETUJUI'], ['nomor', 'Diberi nomor', 'NOMOR_DIBERIKAN'], ['ttd', 'Ditandatangani', 'DITANDATANGANI'], ['kirim', 'Dikirim', 'DIKIRIM'], ['selesai', 'Selesai', 'SELESAI']] as const;
const ORDER = ['DRAFT', 'REVISI', 'REVIEW', 'MENUNGGU_PERSETUJUAN', 'DISETUJUI', 'NOMOR_DIBERIKAN', 'DITANDATANGANI', 'DIKIRIM', 'SELESAI'];
const AKSI: Record<string, string> = {
  AJUKAN: 'Diajukan untuk persetujuan', AJUKAN_REVIEW: 'Diajukan untuk diperiksa', REVIEW_LANJUT: 'Pemeriksaan selesai, diteruskan ke pimpinan',
  REVIEW_REVISI: 'Dikembalikan pemeriksa untuk diperbaiki', SETUJU: 'Disetujui dan diberi nomor', REVISI: 'Dikembalikan untuk diperbaiki', TOLAK: 'Ditolak',
  TTD: 'Dokumen bertanda tangan diunggah', KIRIM: 'Pengiriman dicatat', SELESAI: 'Selesai',
};

/** Satu langkah untuk pengguna ini pada surat keluar ini. */
function nextStep(d: LetterOutDetail, run: { open: (k: Dlg) => void; submit: () => void; done: () => void }): NextStepInfo {
  const l = d.letter; const c = d.can;
  const note = d.approvals[d.approvals.length - 1]?.catatan;
  if (l.status === 'DITOLAK') return { quiet: true, title: 'Surat ini ditolak', desc: note || 'Lihat catatan di Riwayat persetujuan.' };
  if (c.putuskan) return { title: 'Surat ini menunggu keputusan Anda', desc: 'Setujui untuk memberi nomor surat otomatis, atau kembalikan dengan catatan perbaikan.', primary: { label: 'Putuskan Persetujuan', onClick: () => run.open('decide') } };
  if (c.review) return { title: 'Surat ini menunggu pemeriksaan Anda', desc: 'Teruskan ke pimpinan bila sudah benar, atau kembalikan untuk diperbaiki.', primary: { label: 'Beri Hasil Pemeriksaan', onClick: () => run.open('review') } };
  if (c.ajukan && d.kurang.length) return { title: 'Lengkapi isian surat dulu', desc: `Belum diisi: ${d.kurang.join(', ')}.`, primary: c.edit ? { label: 'Ubah Isi Surat', onClick: () => run.open('edit') } : undefined };
  if (c.ajukan) return { title: l.status === 'REVISI' ? 'Sudah diperbaiki? Ajukan lagi' : 'Draf siap diajukan ke pimpinan', desc: l.status === 'REVISI' && note ? `Catatan perbaikan: ${note}` : 'Pimpinan akan mendapat pemberitahuan. Nomor surat diberikan setelah disetujui.', primary: { label: 'Ajukan ke Pimpinan', onClick: run.submit } };
  if (c.ttd) return { title: 'Surat sudah bernomor', desc: 'Cetak, tanda tangani, pindai, lalu unggah sebagai PDF.', primary: { label: 'Unggah Surat Bertanda Tangan', onClick: () => run.open('sign') } };
  if (c.kirim) return { title: 'Surat sudah ditandatangani', desc: 'Catat cara surat dikirim kepada tujuan.', primary: { label: 'Catat Pengiriman', onClick: () => run.open('send') } };
  if (c.selesai) return { title: 'Surat sudah dikirim', desc: 'Nyatakan selesai bila tidak ada tindak lanjut lagi.', primary: { label: 'Nyatakan Selesai', onClick: run.done } };
  const wait: Record<string, string> = { REVIEW: 'Menunggu pemeriksaan', MENUNGGU_PERSETUJUAN: 'Menunggu persetujuan pimpinan', SELESAI: 'Surat keluar ini sudah selesai', DIKIRIM: 'Surat sudah dikirim', DRAFT: 'Draf belum diajukan', REVISI: 'Menunggu perbaikan dari pembuat', NOMOR_DIBERIKAN: 'Menunggu tanda tangan', DITANDATANGANI: 'Menunggu pengiriman oleh Tata Usaha' };
  return { quiet: true, title: wait[l.status] || 'Tidak ada yang perlu Anda lakukan sekarang', desc: 'Anda tetap dapat melihat dokumen dan riwayatnya.' };
}

function DecisionDialog({ id, mode, onClose }: { id: number; mode: 'review' | 'decide'; onClose: () => void }) {
  const [aksi, setAksi] = useState('setuju');
  const [catatan, setCatatan] = useState('');
  const [err, setErr] = useState('');
  const isReview = mode === 'review';
  const act = useAction(() => (isReview ? api.post(`/letters-out/${id}/review`, { aksi: aksi === 'setuju' ? 'lanjut' : 'revisi', catatan }) : api.post(`/letters-out/${id}/keputusan`, { aksi, catatan })), { success: 'Keputusan sudah disimpan.', keys: KEYS, onDone: onClose });
  const opts = isReview ? [['setuju', 'Sudah benar, teruskan ke pimpinan'], ['revisi', 'Perlu diperbaiki, kembalikan ke pembuat']] : [['setuju', 'Setujui dan beri nomor surat'], ['revisi', 'Perlu diperbaiki, kembalikan ke pembuat'], ['tolak', 'Tolak surat ini']];
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={isReview ? 'Hasil pemeriksaan' : 'Keputusan persetujuan'} error={err} danger={aksi === 'tolak'}
      confirmLabel={aksi === 'setuju' ? (isReview ? 'Teruskan ke Pimpinan' : 'Setujui Surat') : aksi === 'tolak' ? 'Tolak Surat' : 'Kembalikan untuk Diperbaiki'} pending={act.isPending}
      onConfirm={() => { if (aksi !== 'setuju' && !catatan.trim()) { setErr('Tulis catatan agar pembuat tahu apa yang perlu diperbaiki.'); return; } setErr(''); act.mutate(); }}>
      <Choices legend="Keputusan Anda">
        <RadioGroup value={aksi} onValueChange={setAksi}>{opts.map(([v, label]) => <ChoiceRow key={v}><RadioGroupItem value={v} /><span>{label}</span></ChoiceRow>)}</RadioGroup>
      </Choices>
      <Field label="Catatan" required={aksi !== 'setuju'}>{(p) => <Textarea {...p} value={catatan} onChange={(e) => setCatatan(e.target.value)} />}</Field>
    </ActionDialog>
  );
}

function SignDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const act = useAction(() => api.upload(`/letters-out/${id}/ttd`, {}, { file: files[0] }), { success: 'Surat bertanda tangan sudah tersimpan.', keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Unggah surat bertanda tangan" description="Cetak surat bernomor, tanda tangani, pindai, lalu pilih file PDF-nya di sini." error={err}
      confirmLabel="Simpan Surat Bertanda Tangan" pending={act.isPending} onConfirm={() => { if (!files.length) { setErr('Pilih file PDF.'); return; } setErr(''); act.mutate(); }}>
      <FilePicker files={files} onChange={setFiles} multiple={false} accept=".pdf" label="Pilih File PDF" />
    </ActionDialog>
  );
}

function SendDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const metodeKirim = useRefValues('metode_kirim', METODE_KIRIM);
  const [metode, setMetode] = useState('Surat resmi');
  const [catatan, setCatatan] = useState('');
  const act = useAction(() => api.post(`/letters-out/${id}/kirim`, { metode, catatan }), { success: 'Pengiriman sudah dicatat.', keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Catat pengiriman surat" confirmLabel="Simpan Catatan Pengiriman" pending={act.isPending} onConfirm={() => act.mutate()}>
      <Field label="Dikirim lewat" required>{(p) => <NativeSelect {...p} value={metode} onChange={(e) => setMetode(e.target.value)}>{metodeKirim.map((m) => <option key={m}>{m}</option>)}</NativeSelect>}</Field>
      <Field label="Catatan">{(p) => <Textarea {...p} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: Dikirim lewat email ke tata usaha sekolah." />}</Field>
    </ActionDialog>
  );
}

function UploadDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const act = useAction(() => api.upload(`/letters-out/${id}/lampiran`, {}, { files }), { success: 'Dokumen sudah tersimpan.', keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Tambah dokumen pendukung" error={err} confirmLabel="Simpan Dokumen" pending={act.isPending}
      onConfirm={() => { if (!files.length) { setErr('Pilih minimal satu file.'); return; } setErr(''); act.mutate(); }}>
      <FilePicker files={files} onChange={setFiles} />
    </ActionDialog>
  );
}

function EditDialog({ d, onClose }: { d: LetterOutDetail; onClose: () => void }) {
  const users = useUserOptions();
  const l = d.letter;
  const act = useAction((body: unknown) => api.put(`/letters-out/${l.id}`, body), { success: 'Isi surat sudah diperbarui.', keys: KEYS, onDone: onClose });
  const signers = (users.data || []).filter((u) => ['pimpinan', 'pejabat', 'superadmin'].includes(u.role));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:w-[min(1280px,calc(100vw-32px))]">
        <DialogHeader><DialogTitle>Ubah isi surat</DialogTitle><DialogDescription>Simpan untuk membuat versi dokumen yang baru.</DialogDescription></DialogHeader>
        <DialogBody>
          {users.isPending ? <Loading /> : (
            <LetterForm fields={d.template.fields} versionId={l.template_version_id} signers={signers} pending={act.isPending} submitLabel="Simpan Perubahan"
              initial={{ perihal: l.perihal, tujuan: l.tujuan, tgl_surat: l.tgl_surat, penandatangan_id: l.penandatangan_id, fields: l.fields }} onSubmit={(f) => act.mutate(f)}
              cancel={<Button type="button" variant="outline" onClick={onClose}>Batal</Button>} />
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function Detail({ d }: { d: LetterOutDetail }) {
  const user = useUser();
  const l = d.letter; const c = d.can;
  const [dlg, setDlg] = useState<Dlg>(null);
  const close = () => setDlg(null);
  const submit = useAction(() => api.post(`/letters-out/${l.id}/ajukan`), { success: 'Surat sudah diajukan ke pimpinan.', keys: KEYS });
  const reviewReq = useAction(() => api.post(`/letters-out/${l.id}/ajukan-review`), { success: 'Surat sudah diajukan untuk diperiksa.', keys: KEYS });
  const done = useAction(() => api.post(`/letters-out/${l.id}/selesai`), { success: 'Surat keluar sudah dinyatakan selesai.', keys: KEYS });
  const preview = useQuery({ queryKey: ['letter-out-preview', l.id, l.status, l.nomor_surat], queryFn: () => api.get<{ html: string }>(`/letters-out/${l.id}/pratinjau`) });
  const step = nextStep(d, { open: setDlg, submit: () => submit.mutate(), done: () => done.mutate() });
  const idx = ORDER.indexOf(l.status);
  const others = [
    c.edit && step.primary?.label !== 'Ubah Isi Surat' && { label: 'Ubah Isi Surat', desc: 'Perbaiki isi sebelum diajukan.', onClick: () => setDlg('edit') },
    c.ajukanReview && { label: 'Minta Diperiksa Dulu', desc: 'Minta pejabat memeriksa sebelum ke pimpinan.', onClick: () => reviewReq.mutate() },
    c.unggah && { label: 'Tambah Dokumen Pendukung', desc: 'Lampirkan file lain untuk surat ini.', onClick: () => setDlg('upload') },
  ].filter((x): x is { label: string; desc: string; onClick: () => void } => Boolean(x));
  return (
    <>
      <PageHeader back={{ href: '/surat-keluar', label: 'Surat Keluar' }} title={l.perihal}
        meta={<><Stamp>{l.no_agenda}</Stamp><StatusOut status={l.status} />{l.nomor_surat && <span className="text-sm font-semibold">Nomor {l.nomor_surat}</span>}</>}>
        <OtherActions items={others} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <NextStep step={step} busy={submit.isPending || done.isPending} />
          {l.status === 'REVISI' && d.approvals.length > 0 && <Alert variant="warn"><span><strong>Perlu diperbaiki.</strong> {d.approvals[d.approvals.length - 1].catatan}</span></Alert>}

          <Section title="Isi surat" intro="Sesuai dokumen yang akan dicetak."
            action={<div className="no-print flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><a href={`/api/letters-out/${l.id}/unduh?format=pdf`}><DownloadIcon aria-hidden /> PDF</a></Button>
              <Button asChild size="sm" variant="outline"><a href={`/api/letters-out/${l.id}/unduh?format=docx`}><DownloadIcon aria-hidden /> Word</a></Button>
            </div>}>
            <Async q={preview} isEmpty={() => false} loadingLabel="Menyusun tampilan surat…">
              {(v) => <div className="preview-doc rounded-2xl border border-border p-5 sm:p-8" dangerouslySetInnerHTML={{ __html: v.html }} />}
            </Async>
          </Section>

          <Section title={`Dokumen (${d.attachments.length})`}><FileList files={d.attachments} /></Section>

          <Section title="Catatan dan riwayat">
            <Card><CardContent><Discussion base={`/letters-out/${l.id}`} queryKey={['out', String(l.id)]} canWrite={c.komentar && user.role !== 'viewer'} /></CardContent></Card>
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title="Tahapan">
            <Card><CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-2 text-sm">
                {([['Kepada', l.tujuan], ['Jenis', l.jenis], ['Tanggal', fmtDate(l.tgl_surat)], ['Dibuat oleh', l.pembuat], ['Penandatangan', d.signer?.nama || 'Belum dipilih']] as const).map(([k, v]) => (
                  <div key={k} className="flex flex-col"><dt className="text-muted-foreground">{k}</dt><dd className="break-words font-medium">{v}</dd></div>
                ))}
                {d.asal && <div className="flex flex-col"><dt className="text-muted-foreground">Balasan untuk</dt><dd><Link href={`/surat-masuk/${d.asal.id}`}>{d.asal.perihal}</Link></dd></div>}
              </dl>
              {l.status === 'DITOLAK' ? <Alert variant="late">Surat ini ditolak.</Alert> : <Steps label="Tahapan surat keluar" items={FLOW.map(([k, label, at]) => ({ key: k, label, done: idx >= ORDER.indexOf(at) }))} />}
            </CardContent></Card>
          </Section>
          <Section title="Riwayat persetujuan">
            {d.approvals.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada keputusan.</p> : (
              <ol className="flex flex-col rounded-2xl border border-border bg-card shadow-(--shadow-card) px-4 py-1">
                {[...d.approvals].reverse().map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 border-t border-line py-3 text-sm first:border-t-0">
                    <span className="font-semibold">{AKSI[a.aksi] || a.aksi}</span>
                    <span className="text-muted-foreground">{fmtDateTime(a.created_at)}, {a.user_nama}</span>
                    {a.catatan && <p className="mt-1 rounded-md bg-muted px-3 py-2">{a.catatan}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </aside>
      </div>

      {dlg === 'edit' && <EditDialog d={d} onClose={close} />}
      {dlg === 'review' && <DecisionDialog id={l.id} mode="review" onClose={close} />}
      {dlg === 'decide' && <DecisionDialog id={l.id} mode="decide" onClose={close} />}
      {dlg === 'sign' && <SignDialog id={l.id} onClose={close} />}
      {dlg === 'send' && <SendDialog id={l.id} onClose={close} />}
      {dlg === 'upload' && <UploadDialog id={l.id} onClose={close} />}
    </>
  );
}

export function LetterOutDetailPage({ id }: { id: string }) {
  const q = useLetterOut(id);
  return <Page wide><Async q={q} isEmpty={() => false} loadingLabel="Membuka surat…">{(d) => <Detail d={d} />}</Async></Page>;
}
