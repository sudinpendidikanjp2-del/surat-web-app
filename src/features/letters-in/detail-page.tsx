'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Discussion } from '@/components/app/discussion';
import { FileList } from '@/components/app/file-list';
import { NextStep, OtherActions, type NextStepInfo } from '@/components/app/next-step';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Deadline, Stamp, StatusDisp, StatusIn, StatusOut, StatusTask } from '@/components/app/status';
import { Steps } from '@/components/app/steps';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import type { PublicUser } from '@/domain/roles';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { KEYS, useLetterIn, type DispositionView, type LetterInDetail } from './api';
import { ConfirmDialog, DisposeDialog, EditDialog, FinishDialog, QrDialog, ReturnDialog, TaskDialog, TrackDialog, UploadDialog } from './dialogs';

type DialogKey = 'dispose' | 'forwardDisp' | 'return' | 'task' | 'upload' | 'confirm' | 'finish' | 'edit' | 'qr' | 'track';
type Run = { forward: () => void; accept: (id: number) => void; archive: () => void; open: (k: DialogKey, disp?: DispositionView) => void };

/** Apa yang perlu dilakukan pengguna ini sekarang pada surat ini. */
function nextStep(d: LetterInDetail, user: PublicUser, run: Run): NextStepInfo {
  const l = d.letter;
  const can = d.can;
  const open = d.tasks.filter((t) => !['SELESAI', 'DIBATALKAN'].includes(t.status));
  const mine = open.filter((t) => t.pic_user_id === user.id);
  const myNew = d.dispositions.find((x) => d.holds.includes(x.id) && x.status === 'BARU');
  const leader = ['pimpinan', 'superadmin'].includes(user.role);
  if (l.status === 'DIARSIPKAN') return { quiet: true, title: 'Surat ini sudah diarsipkan', desc: 'Semua dokumen dan riwayatnya tetap dapat dibuka di bawah.' };
  if (l.status === 'SELESAI') return can.arsipkan
    ? { title: 'Surat sudah selesai. Simpan ke arsip.', desc: 'Surat akan tersusun di Arsip menurut tahun dan bulan.', primary: { label: 'Simpan ke Arsip', onClick: run.archive } }
    : { quiet: true, title: 'Surat ini sudah selesai', desc: 'Tata Usaha akan menyimpannya ke arsip.' };
  if (can.forward) return { title: 'Teruskan surat ini ke pimpinan', desc: 'Surat sudah dicatat. Pimpinan perlu memberi disposisi (arahan).', primary: { label: 'Teruskan ke Pimpinan', onClick: run.forward } };
  if (can.terima && myNew) return { title: 'Anda menerima disposisi baru', desc: `Dari ${myNew.dari_nama}: "${myNew.instruksi}". Tekan tombol untuk menyatakan Anda sudah menerimanya.`, primary: { label: 'Terima Disposisi', onClick: () => run.accept(myNew.id) } };
  if (l.status === 'MENUNGGU_DISPOSISI' && can.disposisi && leader) return { title: 'Surat ini menunggu disposisi Anda', desc: 'Pilih siapa yang mengerjakan, apa yang harus dilakukan, dan kapan harus selesai.', primary: { label: 'Beri Disposisi', onClick: () => run.open('dispose') } };
  if (mine.length) return { title: `Anda sedang mengerjakan ${mine.length} tugas dari surat ini`, desc: `Batas waktu terdekat ${fmtDate(mine.map((t) => t.deadline || '').filter(Boolean).sort()[0])}.`, primary: { label: 'Buka Tugas Saya', href: `/tugas/${mine[0].id}` } };
  if (can.tugaskan && d.tasks.length === 0 && d.holds.length > 0) return { title: 'Bagikan pekerjaan ke pegawai', desc: 'Tentukan siapa yang mengerjakan dan batas waktunya.', primary: { label: 'Tugaskan Pegawai', onClick: () => run.open('task') } };
  if (can.selesaikan && d.syarat.ok) return { title: 'Semua syarat sudah terpenuhi', desc: 'Tugas selesai, balasan terkirim, dan pengirim sudah dikabari.', primary: { label: 'Nyatakan Surat Selesai', onClick: () => run.open('finish') } };
  if (can.konfirmasi && d.tasks.length > 0 && open.length === 0 && d.confirmations.length === 0) return { title: 'Kabari pengirim surat', desc: 'Semua tugas sudah selesai. Catat bahwa pengirim sudah diberi tahu hasilnya.', primary: { label: 'Catat Kabar ke Pengirim', onClick: () => run.open('confirm') } };
  if (open.length) return { quiet: true, title: `Menunggu ${[...new Set(open.map((t) => t.pic_nama))].join(', ')}`, desc: `${open.length} tugas belum selesai. Tidak ada yang perlu Anda lakukan sekarang.` };
  if (l.status === 'MENUNGGU_DISPOSISI') return { quiet: true, title: 'Menunggu disposisi pimpinan', desc: 'Surat sudah diteruskan ke pimpinan.' };
  if (l.status === 'DIDISPOSISIKAN') return { quiet: true, title: 'Menunggu penerima disposisi', desc: 'Penerima belum menyatakan sudah menerima disposisi.' };
  return { quiet: true, title: 'Tidak ada yang perlu Anda lakukan sekarang', desc: 'Anda tetap dapat menambah catatan atau dokumen.' };
}

function position(d: LetterInDetail) {
  const l = d.letter;
  if (l.status === 'SELESAI') return 'Selesai';
  if (l.status === 'DIARSIPKAN') return 'Arsip';
  if (l.status === 'DITERIMA') return 'Tata Usaha';
  if (l.status === 'MENUNGGU_DISPOSISI') return 'Pimpinan';
  return [...new Set(d.dispositions.filter((x) => ['BARU', 'DITERIMA'].includes(x.status)).map((x) => x.ke_nama || x.ke_unit))].join(', ') || '-';
}

function Detail({ d }: { d: LetterInDetail }) {
  const user = useUser();
  const l = d.letter;
  const can = d.can;
  const [dlg, setDlg] = useState<DialogKey | null>(null);
  const [disp, setDisp] = useState<DispositionView | undefined>();
  const open = (k: DialogKey, x?: DispositionView) => { setDisp(x); setDlg(k); };
  const close = (o: boolean) => { if (!o) setDlg(null); };
  const forward = useAction(() => api.post(`/letters-in/${l.id}/teruskan`), { success: 'Surat sudah diteruskan ke pimpinan.', keys: KEYS });
  const accept = useAction((id: number) => api.post(`/dispositions/${id}/terima`), { success: 'Disposisi sudah Anda terima.', keys: KEYS });
  const archive = useAction(() => api.post(`/letters-in/${l.id}/arsipkan`), { success: 'Surat sudah disimpan ke arsip.', keys: KEYS });
  const busy = forward.isPending || accept.isPending || archive.isPending;
  const step = nextStep(d, user, { forward: () => forward.mutate(), accept: (id) => accept.mutate(id), archive: () => archive.mutate(), open });
  const myDisp = d.dispositions.filter((x) => d.holds.includes(x.id) && ['BARU', 'DITERIMA'].includes(x.status));
  const fwdTarget = myDisp.find((x) => x.status === 'DITERIMA');
  const leaderWaiting = l.status === 'MENUNGGU_DISPOSISI' && ['pimpinan', 'superadmin'].includes(user.role);
  const title = step.primary?.label;
  const others = [
    can.disposisi && fwdTarget && { label: 'Teruskan Disposisi', desc: 'Teruskan disposisi yang Anda terima ke pejabat atau pegawai lain.', onClick: () => open('forwardDisp', fwdTarget) },
    can.disposisi && !fwdTarget && !leaderWaiting && { label: 'Beri Disposisi', desc: 'Kirim arahan kepada unit kerja atau orang tertentu.', onClick: () => open('dispose') },
    can.tugaskan && { label: 'Tugaskan Pegawai', desc: 'Bagikan pekerjaan dengan batas waktu yang jelas.', onClick: () => open('task') },
    can.balas && { label: 'Buat Surat Balasan', desc: 'Buat surat keluar yang sudah terisi dari surat ini.', href: `/surat-keluar/baru?dari=${l.id}` },
    can.upload && { label: 'Tambah Dokumen', desc: 'Simpan file pendukung atau hasil pekerjaan.', onClick: () => open('upload') },
    can.konfirmasi && { label: 'Catat Kabar ke Pengirim', desc: 'Catat bahwa pengirim sudah diberi tahu hasilnya.', onClick: () => open('confirm') },
    can.selesaikan && { label: 'Nyatakan Surat Selesai', desc: 'Periksa syarat lalu tutup urusan surat ini.', onClick: () => open('finish') },
    can.arsipkan && { label: 'Simpan ke Arsip', desc: 'Surat selesai disimpan menurut tahun dan bulan.', onClick: () => archive.mutate() },
    can.edit && { label: 'Ubah Data Surat', desc: 'Perbaiki nomor, tanggal, pengirim, atau perihal.', onClick: () => open('edit') },
    can.cetak && { label: 'Cetak Lembar Disposisi', desc: 'Lembar disposisi kertas untuk map surat.', href: `/surat-masuk/${l.id}/cetak` },
    { label: 'Lihat Kode QR', desc: 'Kode untuk ditempel di map surat.', onClick: () => open('qr') },
    can.lacak && { label: 'Pelacakan oleh Pengirim', desc: 'Kode agar pengirim bisa melihat tahapan surat.', onClick: () => open('track') },
  ].filter((x): x is NonNullable<typeof x> & { label: string; desc: string } => Boolean(x)).filter((x) => x.label !== title);

  return (
    <>
      <PageHeader back={{ href: '/surat-masuk', label: 'Kembali ke daftar Surat Masuk' }} title={l.perihal}>
        <div className="flex flex-wrap items-center gap-2"><Stamp>{l.no_agenda}</Stamp><StatusIn status={l.status} /><Deadline sla={d.sla} /></div>
      </PageHeader>

      <NextStep step={step} busy={busy} />

      <Section title="Keadaan surat" id="keadaan">
        <Card><CardContent className="grid gap-6 md:grid-cols-2">
          <dl className="grid content-start gap-x-6 gap-y-3 text-lg sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Sekarang di</dt><dd className="font-bold">{position(d)}</dd>
            <dt className="text-muted-foreground">Batas waktu</dt><dd><span className="font-bold">{fmtDate(d.deadline)}</span><br /><Deadline sla={d.sla} /></dd>
            <dt className="text-muted-foreground">Kemajuan</dt><dd className="font-bold">{d.percent}% tahapan</dd>
          </dl>
          <Steps label="Tahapan surat" items={d.stages} />
        </CardContent></Card>
      </Section>

      <OtherActions items={others} />

      <Section title="Data surat" id="data">
        <Card><CardContent>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-[220px_1fr]">
            {([
              ['Nomor agenda', l.no_agenda], ['Nomor surat', l.no_surat], ['Tanggal surat', fmtDate(l.tgl_surat)], ['Tanggal diterima', fmtDate(l.tgl_diterima)],
              ['Pengirim', `${l.asal}${l.instansi ? `, ${l.instansi}` : ''}`], ['Alamat pengirim', l.alamat || '-'], ['Jenis surat', l.jenis], ['Sifat', l.sifat],
              ['Seberapa mendesak', l.prioritas], ['Lampiran', l.lampiran || '-'], ['Catatan', l.catatan || '-'], ['Dicatat oleh', l.creator_nama || '-'],
            ] as const).map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-words font-semibold">{v}</dd></div>)}
          </dl>
        </CardContent></Card>
      </Section>

      <Section title={`Disposisi (${d.dispositions.length})`} intro="Disposisi adalah arahan pimpinan: siapa yang mengerjakan dan apa yang harus dilakukan." id="disposisi">
        {d.dispositions.length === 0 ? <Empty title="Belum ada disposisi" text="Disposisi dari pimpinan akan tampil di sini." /> : (
          <ul className="flex flex-col gap-4">
            {d.dispositions.map((x) => (
              <li key={x.id}><Card><CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg"><strong>{x.dari_nama}</strong> kepada <strong>{x.ke_nama || x.ke_unit}</strong></p>
                  <StatusDisp status={x.status} />
                </div>
                <div className="flex flex-wrap gap-2">{x.tindakan.map((t) => <Badge key={t} tone="accent">{t}</Badge>)}</div>
                <p className="text-lg">&ldquo;{x.instruksi}&rdquo;</p>
                <p className="text-muted-foreground">Harus selesai {fmtDate(x.deadline)}. Diberikan {fmtDateTime(x.created_at)}{x.accepted_at ? `. Diterima ${fmtDateTime(x.accepted_at)}` : ''}.</p>
                {x.return_reason && <Alert variant="late">Dikembalikan dengan alasan: {x.return_reason}</Alert>}
                {d.holds.includes(x.id) && ['BARU', 'DITERIMA'].includes(x.status) && (
                  <div className="no-print flex flex-wrap gap-3">
                    {x.status === 'BARU' && <Button disabled={accept.isPending} onClick={() => accept.mutate(x.id)}>Terima Disposisi</Button>}
                    <Button variant="destructive" onClick={() => open('return', x)}>Kembalikan</Button>
                  </div>
                )}
              </CardContent></Card></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Tugas (${d.tasks.length})`} id="tugas">
        {d.tasks.length === 0 ? <Empty title="Belum ada tugas" text="Pejabat penerima disposisi dapat membagi pekerjaan dengan tombol Tugaskan Pegawai." /> : (
          <ul className="flex flex-col gap-3">
            {d.tasks.map((t) => (
              <li key={t.id}><Card><CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <Link href={`/tugas/${t.id}`} className="text-lg font-bold text-foreground">{t.judul}</Link>
                  <p className="text-muted-foreground">Dikerjakan {t.pic_nama}. Batas waktu {fmtDate(t.deadline)}. Kemajuan {t.progress}%.</p>
                </div>
                <StatusTask status={t.status} />
              </CardContent></Card></li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Dokumen (${d.attachments.length})`} id="dokumen">
        {user.role === 'viewer' ? <p className="text-muted-foreground">Peran Pemantau tidak dapat membuka dokumen surat.</p> : <FileList files={d.attachments} />}
      </Section>

      <Section title="Surat balasan dan kabar ke pengirim" id="balasan">
        <Card><CardContent className="flex flex-col gap-4">
          {d.outs.length === 0 ? <p className="text-muted-foreground">Belum ada surat balasan.</p> : d.outs.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2"><Link href={`/surat-keluar/${o.id}`} className="font-bold">{o.perihal}</Link><StatusOut status={o.status} /><span className="text-muted-foreground">{o.nomor_surat || 'Belum bernomor'}</span></div>
          ))}
          {d.confirmations.length === 0 ? <p className="text-muted-foreground">Pengirim belum dikabari.</p> : d.confirmations.map((c) => (
            <p key={c.id}><strong>{fmtDate(c.tanggal)}</strong>: {c.pihak} dikabari lewat {c.metode.toLowerCase()}. {c.hasil}</p>
          ))}
        </CardContent></Card>
      </Section>

      <Section title="Catatan dan riwayat" intro="Semua yang terjadi pada surat ini tercatat otomatis, terbaru di atas." id="riwayat">
        <Card><CardContent><Discussion base={`/letters-in/${l.id}`} queryKey={[String(l.id)]} canWrite={can.komentar} /></CardContent></Card>
      </Section>

      {/* Dialog dipasang hanya saat dibuka, jadi isiannya selalu mulai dari keadaan bersih. */}
      {dlg === 'dispose' && <DisposeDialog open onOpenChange={close} letter={l} />}
      {dlg === 'forwardDisp' && disp && <DisposeDialog open onOpenChange={close} letter={l} parent={disp} />}
      {dlg === 'return' && disp && <ReturnDialog open onOpenChange={close} disp={disp} />}
      {dlg === 'task' && <TaskDialog open onOpenChange={close} data={d} />}
      {dlg === 'upload' && <UploadDialog open onOpenChange={close} data={d} />}
      {dlg === 'confirm' && <ConfirmDialog open onOpenChange={close} data={d} />}
      {dlg === 'finish' && <FinishDialog open onOpenChange={close} data={d} />}
      {dlg === 'edit' && <EditDialog open onOpenChange={close} data={d} />}
      {dlg === 'qr' && <QrDialog open onOpenChange={close} id={l.id} />}
      {dlg === 'track' && <TrackDialog open onOpenChange={close} id={l.id} canEdit={can.aturLacak} />}
    </>
  );
}

export function LetterInDetailPage({ id }: { id: string }) {
  const q = useLetterIn(id);
  return (
    <Page>
      <Async q={q} isEmpty={() => false} loadingLabel="Sedang membuka surat…">{(d) => <Detail d={d} />}</Async>
    </Page>
  );
}
