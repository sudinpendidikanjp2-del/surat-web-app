'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CloudDownloadIcon, DatabaseBackupIcon, DownloadIcon, EllipsisIcon, HistoryIcon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ActionDialog } from '@/components/app/action-dialog';
import { ChoiceRow, Field } from '@/components/app/form-field';
import { FilePicker } from '@/components/app/file-picker';
import { Page, PageHeader, Panel, Section } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { api, ApiError } from '@/lib/api-client';
import { fmtDateTime, fmtSize } from '@/lib/format';

type Kind = 'manual' | 'otomatis' | 'sebelum-pemulihan' | 'unggahan' | 'drive';
interface Backup { nama: string; dibuat: string; jenis: Kind; label: string; tabel: Record<string, number>; file: number; ukuran: number }
interface Schedule { otomatis: boolean; jam: string; simpan: number; ke_drive: boolean }
interface Overview {
  cadangan: Backup[]; jadwal: Schedule; berjalan: string | null; google: boolean; kata_konfirmasi: string;
  status: { terakhir: string | null; galat: string | null; drive: string | null };
}
interface DriveBackup { id: string; nama: string; ukuran: number; diubah: string | null }

const KIND: Record<Kind, { label: string; tone: 'neutral' | 'accent' | 'yellow' | 'ok' | 'warn' }> = {
  manual: { label: 'Dibuat manual', tone: 'accent' },
  otomatis: { label: 'Otomatis harian', tone: 'neutral' },
  'sebelum-pemulihan': { label: 'Pengaman sebelum pemulihan', tone: 'warn' },
  unggahan: { label: 'Diunggah', tone: 'yellow' },
  drive: { label: 'Dari Google Drive', tone: 'ok' },
};

/** Ringkasan isi: angka yang dikenali orang (surat, pengguna, file), bukan nama tabel. */
const contents = (b: Backup) => [
  `${b.tabel.letters_in ?? 0} surat masuk`, `${b.tabel.letters_out ?? 0} surat keluar`, `${b.tabel.users ?? 0} pengguna`, `${b.file} file`,
].join(' · ');

/** Unggah arsip apa adanya (bukan multipart) agar server dapat mengalirkannya ke disk. */
async function uploadArchive(file: File) {
  const res = await fetch('/api/cadangan/unggah', { method: 'POST', headers: { 'X-Requested-With': 'surat-app', 'Content-Type': 'application/gzip' }, body: file, credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'File cadangan tidak dapat diunggah');
  return data as Backup;
}

export function BackupPage() {
  const q = useQuery({
    queryKey: ['cadangan'], queryFn: () => api.get<Overview>('/cadangan'),
    refetchInterval: (s) => (s.state.data?.berjalan ? 2000 : false),
  });
  const create = useAction(() => api.post<{ cadangan: Backup; drive: { ok: boolean; pesan?: string } | null }>('/cadangan', { ke_drive: q.data?.google && q.data.jadwal.ke_drive }), {
    keys: ['cadangan'],
    success: (r) => (r.drive && !r.drive.ok ? `Cadangan dibuat di server, tetapi gagal disalin ke Drive: ${r.drive.pesan}` : `Cadangan dibuat (${fmtSize(r.cadangan.ukuran)}).`),
  });
  return (
    <Page wide className="max-w-6xl">
      <PageHeader title="Cadangan & Pemulihan"
        intro="Satu file cadangan berisi seluruh data (surat, disposisi, tugas, pengguna, pengaturan) dan semua file lampiran.">
        <Button disabled={create.isPending || !!q.data?.berjalan} onClick={() => create.mutate()}>
          <DatabaseBackupIcon aria-hidden /> {create.isPending ? 'Membuat cadangan…' : 'Buat Cadangan Sekarang'}
        </Button>
      </PageHeader>
      <Alert variant="warn">
        File cadangan memuat data pribadi pegawai dan isi surat. Simpan di tempat yang hanya dapat dibuka petugas berwenang.
      </Alert>
      <Async q={q} isEmpty={() => false}>
        {(o) => (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="flex min-w-0 flex-col gap-6">
              {o.berjalan && <Alert>Sedang ada proses {o.berjalan}. Halaman ini diperbarui sendiri.</Alert>}
              <BackupList items={o.cadangan} google={o.google} word={o.kata_konfirmasi} />
              <RestoreSources google={o.google} />
            </div>
            <ScheduleCard initial={o.jadwal} status={o.status} google={o.google} />
          </div>
        )}
      </Async>
    </Page>
  );
}

function BackupList({ items, google, word }: { items: Backup[]; google: boolean; word: string }) {
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [deleting, setDeleting] = useState<Backup | null>(null);
  const toDrive = useAction((b: Backup) => api.post(`/cadangan/${b.nama}/ke-drive`), { success: 'Cadangan disalin ke folder Cadangan di Google Drive.' });
  const remove = useAction((b: Backup) => api.del(`/cadangan/${b.nama}`), { keys: ['cadangan'], success: 'Cadangan dihapus dari server.', onDone: () => setDeleting(null) });
  return (
    <Section title="Cadangan tersimpan di server" intro="Terbaru di atas. Unduh untuk menyimpannya di luar server.">
      {items.length === 0 ? (
        <Panel><Empty compact title="Belum ada cadangan" text="Tekan Buat Cadangan Sekarang, atau aktifkan cadangan otomatis di samping." /></Panel>
      ) : (
        <Panel>
          <ul className="divide-y divide-line">
            {items.map((b) => (
              <li key={b.nama} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <span aria-hidden className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink sm:flex"><HistoryIcon className="size-5" /></span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{fmtDateTime(b.dibuat)}</span>
                    <Badge tone={KIND[b.jenis].tone}>{KIND[b.jenis].label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{contents(b)} · {fmtSize(b.ukuran)}</p>
                  {b.label && <p className="truncate text-sm text-muted-foreground">{b.label}</p>}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild size="sm" variant="outline"><a href={`/api/cadangan/${b.nama}`} download><DownloadIcon aria-hidden /> Unduh</a></Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" aria-label={`Aksi lain untuk cadangan ${fmtDateTime(b.dibuat)}`}><EllipsisIcon aria-hidden /> Aksi lain</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setRestoring(b)}>Pulihkan data dari cadangan ini…</DropdownMenuItem>
                      {google && <DropdownMenuItem disabled={toDrive.isPending} onSelect={() => toDrive.mutate(b)}>Salin ke Google Drive</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-late" onSelect={() => setDeleting(b)}>Hapus dari server…</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {restoring && <RestoreDialog backup={restoring} word={word} onClose={() => setRestoring(null)} />}
      <ActionDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} danger
        title="Hapus cadangan ini?" confirmLabel="Hapus Cadangan" pending={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting)}
        description={deleting ? `Cadangan ${fmtDateTime(deleting.dibuat)} dihapus dari server. Salinan yang sudah diunduh atau ada di Google Drive tidak terhapus.` : undefined} />
    </Section>
  );
}

/** Pemulihan mengganti seluruh data: dialog menyebut akibatnya dan meminta kata konfirmasi diketik. */
function RestoreDialog({ backup, word, onClose }: { backup: Backup; word: string; onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const restore = useAction(() => api.post<{ pengaman: string }>(`/cadangan/${backup.nama}/pulihkan`, { konfirmasi: typed }), {
    onDone: () => {
      toast.success('Data dipulihkan. Silakan masuk lagi.');
      // Semua sesi berakhir dan data berganti: buang data tersimpan di peramban lalu ke halaman masuk.
      qc.clear();
      router.replace('/masuk');
    },
  });
  const confirm = () => {
    if (typed.trim().toUpperCase() !== word) { setErr(`Ketik ${word} untuk melanjutkan.`); return; }
    setErr(null);
    restore.mutate();
  };
  return (
    <ActionDialog open onOpenChange={(o) => !o && !restore.isPending && onClose()} danger
      title="Pulihkan data dari cadangan ini?" confirmLabel="Pulihkan Data" pending={restore.isPending} onConfirm={confirm} error={err}
      description={`Data dan file akan dikembalikan ke keadaan ${fmtDateTime(backup.dibuat)}.`}>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>Semua yang dicatat setelah waktu itu tidak ada lagi di aplikasi.</li>
        <li>Sebelum memulihkan, sistem membuat cadangan pengaman dari keadaan sekarang. Bila keliru, pulihkan cadangan pengaman itu.</li>
        <li>Semua pengguna, termasuk Anda, perlu masuk lagi.</li>
        <li>Sambungan Google dan jadwal cadangan tidak berubah.</li>
      </ul>
      <Field label={`Ketik ${word} untuk memastikan`}>{(p) => <Input {...p} autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>
      {restore.isPending && <p className="text-sm text-muted-foreground" aria-live="polite">Sedang memulihkan. Jangan tutup halaman ini; untuk data besar dapat memakan beberapa menit.</p>}
    </ActionDialog>
  );
}

/** Sumber cadangan lain: file dari komputer, atau salinan di Google Drive. Setelah masuk ke daftar, dipulihkan seperti biasa. */
function RestoreSources({ google }: { google: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [showDrive, setShowDrive] = useState(false);
  const up = useAction(() => uploadArchive(files[0]), { keys: ['cadangan'], success: 'Cadangan diunggah dan diperiksa. Pulihkan dari daftar di atas bila perlu.', onDone: () => setFiles([]) });
  const drive = useQuery({ queryKey: ['cadangan-drive'], queryFn: () => api.get<DriveBackup[]>('/cadangan/drive'), enabled: showDrive });
  const fetchOne = useAction((id: string) => api.post<Backup>('/cadangan/drive', { file_id: id }), { keys: ['cadangan'], success: 'Cadangan diambil dari Drive dan masuk daftar di atas.' });
  return (
    <Section title="Pulihkan dari tempat lain" intro="File cadangan diperiksa dulu sebelum masuk daftar; tidak ada data yang berubah sampai Anda menekan Pulihkan.">
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardContent className="flex flex-col gap-3">
          <h3 className="font-bold">Dari komputer</h3>
          <FilePicker files={files} onChange={setFiles} multiple={false} accept=".gz,application/gzip" label="Pilih File Cadangan" hint="File berakhiran .tar.gz yang dulu diunduh dari halaman ini." />
          {files.length > 0 && <div><Button variant="dark" disabled={up.isPending} onClick={() => up.mutate()}><UploadIcon aria-hidden /> {up.isPending ? 'Mengunggah…' : 'Unggah dan Periksa'}</Button></div>}
        </CardContent></Card>
        <Card><CardContent className="flex flex-col gap-3">
          <h3 className="font-bold">Dari Google Drive</h3>
          {!google ? (
            <p className="text-sm text-muted-foreground">Hubungkan Google di halaman <a href="/google">Google Drive & Spreadsheet</a> untuk menyimpan dan mengambil cadangan dari folder Cadangan.</p>
          ) : !showDrive ? (
            <div><Button variant="outline" onClick={() => setShowDrive(true)}><CloudDownloadIcon aria-hidden /> Lihat Cadangan di Drive</Button></div>
          ) : drive.isLoading ? <p className="text-sm text-muted-foreground">Membuka folder Cadangan…</p> : drive.isError ? (
            <Alert variant="late">{(drive.error as Error).message}</Alert>
          ) : drive.data!.length === 0 ? <p className="text-sm text-muted-foreground">Folder Cadangan di Drive masih kosong.</p> : (
            <ul className="flex flex-col gap-2">
              {drive.data!.slice(0, 10).map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                  <span className="min-w-0 text-sm"><span className="font-medium">{fmtDateTime(f.diubah)}</span> <span className="text-muted-foreground">· {fmtSize(f.ukuran)}</span></span>
                  <Button size="sm" variant="outline" disabled={fetchOne.isPending} onClick={() => fetchOne.mutate(f.id)}>Ambil ke Server</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
      </div>
    </Section>
  );
}

function ScheduleCard({ initial, status, google }: { initial: Schedule; status: Overview['status']; google: boolean }) {
  const [v, setV] = useState(initial);
  const save = useAction(() => api.put('/cadangan/jadwal', { ...v, simpan: Number(v.simpan) }), { keys: ['cadangan'], success: () => (v.otomatis ? `Cadangan otomatis setiap hari pukul ${v.jam}.` : 'Cadangan otomatis dimatikan.') });
  return (
    <Section title="Cadangan otomatis">
      <Card><CardContent>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <ChoiceRow><Checkbox checked={v.otomatis} onCheckedChange={(c) => setV({ ...v, otomatis: c === true })} /><span>Buat cadangan setiap hari</span></ChoiceRow>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pukul" hint="Waktu kantor.">{(p) => <Input {...p} type="time" value={v.jam} disabled={!v.otomatis} onChange={(e) => setV({ ...v, jam: e.target.value })} />}</Field>
            <Field label="Simpan" hint="Cadangan terakhir.">{(p) => <Input {...p} type="number" min={1} max={90} value={v.simpan} disabled={!v.otomatis} onChange={(e) => setV({ ...v, simpan: Number(e.target.value) })} />}</Field>
          </div>
          <ChoiceRow className={!google ? 'opacity-60' : undefined}>
            <Checkbox checked={v.ke_drive} disabled={!google} onCheckedChange={(c) => setV({ ...v, ke_drive: c === true })} />
            <span>Salin juga ke Google Drive{!google && ' (hubungkan Google dulu)'}</span>
          </ChoiceRow>
          <div><Button type="submit" variant="dark" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan Jadwal'}</Button></div>
        </form>
        <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm">
          <p><span className="text-muted-foreground">Cadangan otomatis terakhir:</span> {status.terakhir ? fmtDateTime(status.terakhir) : 'belum pernah'}</p>
          {status.galat && <Alert variant="late">Gagal: {status.galat}</Alert>}
          {status.drive && <Alert variant="warn">Tersimpan di server, tetapi gagal disalin ke Drive: {status.drive}</Alert>}
        </div>
      </CardContent></Card>
    </Section>
  );
}
