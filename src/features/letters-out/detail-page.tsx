'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { ActionDialog } from '@/components/app/action-dialog';
import { Discussion } from '@/components/app/discussion';
import { FileList } from '@/components/app/file-list';
import { FilePicker } from '@/components/app/file-picker';
import { Field } from '@/components/app/form-field';
import { NextStep, OtherActions, type NextStepInfo } from '@/components/app/next-step';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async } from '@/components/app/states';
import { Stamp, StatusOut } from '@/components/app/status';
import { Steps } from '@/components/app/steps';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import { METODE_KIRIM } from '@/domain/letter-out';
import { useRefValues } from '@/features/reference/api';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTime, todayIso } from '@/lib/format';
import { KEYS, useLetterOut, type LetterOutDetail } from './api';
import { RecordForm, recordBody } from './record-form';

type Dlg = 'edit' | 'scan' | 'upload' | 'send' | 'cancel' | null;

/** Riwayat persetujuan dari versi lama aplikasi (surat yang dulu disusun dan disetujui di aplikasi). */
const AKSI_LAMA: Record<string, string> = {
  AJUKAN: 'Diajukan untuk persetujuan', AJUKAN_REVIEW: 'Diajukan untuk diperiksa', REVIEW_LANJUT: 'Pemeriksaan selesai, diteruskan ke pimpinan',
  REVIEW_REVISI: 'Dikembalikan pemeriksa untuk diperbaiki', SETUJU: 'Disetujui dan diberi nomor', REVISI: 'Dikembalikan untuk diperbaiki', TOLAK: 'Ditolak',
  TTD: 'Dokumen bertanda tangan diunggah', KIRIM: 'Pengiriman dicatat', SELESAI: 'Selesai',
};

/** Satu langkah berikutnya: bernomor → pindaian bertanda tangan → pengiriman. */
function nextStep(d: LetterOutDetail, open: (k: Dlg) => void): NextStepInfo {
  const l = d.letter; const c = d.can;
  if (l.status === 'DIBATALKAN') return { quiet: true, title: 'Surat ini dibatalkan', desc: l.batal_alasan || undefined };
  if (l.status === 'DIKIRIM') return { quiet: true, title: 'Surat sudah dikirim', desc: `${l.sent_method ? `Lewat ${l.sent_method.toLowerCase()}` : 'Pengiriman dicatat'}${l.sent_at ? `, ${fmtDate(l.sent_at)}` : ''}.` };
  if (!l.nomor_surat) return { title: 'Surat belum bernomor', desc: 'Tulis nomor yang tertera di surat, atau ambil nomor urut berikutnya.', primary: c.edit ? { label: 'Beri Nomor Surat', onClick: () => open('edit') } : undefined };
  if (!d.signed) return { title: 'Unggah pindaian surat yang sudah ditandatangani', desc: 'PDF atau foto surat yang sudah ditandatangani dan bernomor.', primary: c.unggah ? { label: 'Unggah Pindaian Surat', onClick: () => open('scan') } : undefined };
  if (c.kirim) return { title: 'Surat siap dikirim', desc: 'Catat cara dan tanggal surat dikirim kepada tujuan.', primary: { label: 'Catat Pengiriman', onClick: () => open('send') } };
  return { quiet: true, title: 'Menunggu pengiriman dicatat', desc: 'Pembuat surat atau Tata Usaha mencatat pengirimannya.' };
}

function UploadDialog({ id, kind, onClose }: { id: number; kind: 'TTD' | 'PENDUKUNG'; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const scan = kind === 'TTD';
  const act = useAction(() => api.upload(`/letters-out/${id}/lampiran`, { kategori: kind }, { files }), { success: scan ? 'Pindaian surat bertanda tangan sudah tersimpan.' : 'Dokumen sudah tersimpan.', keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={scan ? 'Unggah pindaian surat bertanda tangan' : 'Tambah dokumen pendukung'} error={err}
      description={scan ? 'Pindai atau foto surat yang sudah ditandatangani dan bernomor.' : undefined}
      confirmLabel={scan ? 'Simpan Pindaian' : 'Simpan Dokumen'} pending={act.isPending}
      onConfirm={() => { if (!files.length) { setErr('Pilih minimal satu file.'); return; } setErr(''); act.mutate(); }}>
      <FilePicker files={files} onChange={setFiles} accept={scan ? '.pdf,.png,.jpg,.jpeg' : undefined} />
    </ActionDialog>
  );
}

function SendDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const metodeKirim = useRefValues('metode_kirim', METODE_KIRIM);
  const [metode, setMetode] = useState('Surat resmi');
  const [tanggal, setTanggal] = useState(todayIso());
  const [catatan, setCatatan] = useState('');
  const act = useAction(() => api.post(`/letters-out/${id}/kirim`, { metode, tanggal, catatan }), { success: 'Pengiriman sudah dicatat.', keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Catat pengiriman surat" confirmLabel="Simpan Catatan Pengiriman" pending={act.isPending} onConfirm={() => act.mutate()}>
      <Field label="Dikirim lewat" required>{(p) => <NativeSelect {...p} value={metode} onChange={(e) => setMetode(e.target.value)}>{metodeKirim.map((m) => <option key={m}>{m}</option>)}</NativeSelect>}</Field>
      <Field label="Tanggal dikirim" required>{(p) => <Input {...p} type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />}</Field>
      <Field label="Catatan">{(p) => <Textarea {...p} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: Dikirim lewat email ke tata usaha sekolah." />}</Field>
    </ActionDialog>
  );
}

function CancelDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [alasan, setAlasan] = useState('');
  const [err, setErr] = useState('');
  const act = useAction(() => api.post(`/letters-out/${id}/batal`, { alasan }), { success: 'Surat dibatalkan.', keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Batalkan surat keluar ini?" danger confirmLabel="Batalkan Surat" pending={act.isPending} error={err}
      description="Catatan surat tetap tersimpan dengan status Dibatalkan. Nomornya tidak dipakai ulang."
      onConfirm={() => { if (!alasan.trim()) { setErr('Tulis alasan pembatalan.'); return; } setErr(''); act.mutate(); }}>
      <Field label="Alasan" required>{(p) => <Textarea {...p} rows={3} value={alasan} onChange={(e) => setAlasan(e.target.value)} />}</Field>
    </ActionDialog>
  );
}

function EditDialog({ d, onClose }: { d: LetterOutDetail; onClose: () => void }) {
  const l = d.letter;
  const act = useAction((body: unknown) => api.put(`/letters-out/${l.id}`, body), { success: 'Data surat sudah diperbarui.', keys: KEYS, onDone: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:w-[min(760px,calc(100vw-32px))]">
        <DialogHeader><DialogTitle>Ubah data surat</DialogTitle><DialogDescription>Hanya surat yang belum dikirim yang dapat diubah.</DialogDescription></DialogHeader>
        <DialogBody>
          <RecordForm existingNomor={l.nomor_surat} withFiles={false} pending={act.isPending} submitLabel="Simpan Perubahan"
            initial={{
              nomor_mode: l.nomor_surat ? 'tetap' : 'manual', nomor_surat: '', kode_klasifikasi: '', tgl_surat: l.tgl_surat, jenis: l.jenis, sifat: l.sifat,
              perihal: l.perihal, tujuan: l.tujuan, lampiran: l.lampiran || '', penandatangan_id: l.penandatangan_id ? String(l.penandatangan_id) : '', catatan: l.catatan || '',
            }}
            onSubmit={(v) => act.mutate(recordBody(v))}
            cancel={<Button type="button" variant="outline" onClick={onClose}>Batal</Button>} />
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
  const step = nextStep(d, setDlg);
  const others = [
    c.edit && step.primary?.label !== 'Beri Nomor Surat' && { label: 'Ubah Data Surat', desc: 'Perbaiki nomor, perihal, tujuan, atau tanggal.', onClick: () => setDlg('edit') },
    c.unggah && d.signed && { label: 'Ganti Pindaian Surat', desc: 'Unggah versi baru pindaian bertanda tangan.', onClick: () => setDlg('scan') },
    c.unggah && { label: 'Tambah Dokumen Pendukung', desc: 'Lampirkan file lain untuk surat ini.', onClick: () => setDlg('upload') },
    c.batal && { label: 'Batalkan Surat', desc: 'Surat tidak jadi dikirim.', onClick: () => setDlg('cancel'), danger: true },
  ].filter((x): x is { label: string; desc: string; onClick: () => void; danger?: boolean } => Boolean(x));
  const scans = d.attachments.filter((a) => a.kategori === 'TTD');
  const rest = d.attachments.filter((a) => a.kategori !== 'TTD');
  return (
    <>
      <PageHeader back={{ href: '/surat-keluar', label: 'Surat Keluar' }} title={l.perihal}
        meta={<><Stamp>{l.no_agenda}</Stamp><StatusOut status={l.status} />{l.nomor_surat && <span className="text-sm font-semibold">Nomor {l.nomor_surat}</span>}</>}>
        <OtherActions items={others} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <NextStep step={step} />
          <Section title="Surat bertanda tangan"><FileList files={scans} empty="Belum ada pindaian surat yang sudah ditandatangani." /></Section>
          {rest.length > 0 && <Section title={`Dokumen lain (${rest.length})`}><FileList files={rest} /></Section>}
          <Section title="Catatan dan riwayat">
            <Card><CardContent><Discussion base={`/letters-out/${l.id}`} queryKey={['out', String(l.id)]} canWrite={c.komentar && user.role !== 'viewer'} /></CardContent></Card>
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title="Data surat">
            <Card><CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-2 text-sm">
                {([
                  ['Kepada', l.tujuan], ['Tanggal surat', fmtDate(l.tgl_surat)], ['Jenis', l.jenis], ['Sifat', l.sifat], ['Lampiran', l.lampiran || '-'],
                  ['Ditandatangani oleh', d.signer ? `${d.signer.nama}${d.signer.jabatan ? `, ${d.signer.jabatan}` : ''}` : '-'], ['Dicatat oleh', l.pembuat],
                  ...(l.catatan ? [['Catatan', l.catatan]] : []),
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex flex-col"><dt className="text-muted-foreground">{k}</dt><dd className="break-words font-medium">{v}</dd></div>
                ))}
                {d.asal && <div className="flex flex-col"><dt className="text-muted-foreground">Balasan untuk</dt><dd><Link href={`/surat-masuk/${d.asal.id}`}>{d.asal.perihal}</Link></dd></div>}
              </dl>
              {l.status === 'DIBATALKAN' ? <Alert variant="late">Dibatalkan{l.batal_alasan ? `: ${l.batal_alasan}` : ''}</Alert> : (
                <Steps label="Tahapan surat keluar" items={[
                  { key: 'catat', label: 'Dicatat', done: true },
                  { key: 'nomor', label: 'Bernomor', done: Boolean(l.nomor_surat) },
                  { key: 'ttd', label: 'Pindaian bertanda tangan', done: d.signed },
                  { key: 'kirim', label: 'Dikirim', done: l.status === 'DIKIRIM' },
                ]} />
              )}
            </CardContent></Card>
          </Section>
          {d.approvals.length > 0 && (
            <Section title="Riwayat persetujuan (versi lama)">
              <ol className="flex flex-col rounded-2xl border border-border bg-card px-4 py-1 shadow-(--shadow-card)">
                {[...d.approvals].reverse().map((a) => (
                  <li key={a.id} className="flex flex-col gap-0.5 border-t border-line py-3 text-sm first:border-t-0">
                    <span className="font-semibold">{AKSI_LAMA[a.aksi] || a.aksi}</span>
                    <span className="text-muted-foreground">{fmtDateTime(a.created_at)}, {a.user_nama}</span>
                    {a.catatan && <p className="mt-1 rounded-md bg-muted px-3 py-2">{a.catatan}</p>}
                  </li>
                ))}
              </ol>
            </Section>
          )}
        </aside>
      </div>

      {dlg === 'edit' && <EditDialog d={d} onClose={close} />}
      {dlg === 'scan' && <UploadDialog id={l.id} kind="TTD" onClose={close} />}
      {dlg === 'upload' && <UploadDialog id={l.id} kind="PENDUKUNG" onClose={close} />}
      {dlg === 'send' && <SendDialog id={l.id} onClose={close} />}
      {dlg === 'cancel' && <CancelDialog id={l.id} onClose={close} />}
    </>
  );
}

export function LetterOutDetailPage({ id }: { id: string }) {
  const q = useLetterOut(id);
  return <Page wide><Async q={q} isEmpty={() => false} loadingLabel="Membuka surat…">{(d) => <Detail d={d} />}</Async></Page>;
}
