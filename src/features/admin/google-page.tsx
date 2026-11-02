'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2Icon, CopyIcon, ExternalLinkIcon, FolderIcon, LinkIcon, RefreshCwIcon, SheetIcon, UnplugIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ActionDialog } from '@/components/app/action-dialog';
import { ChoiceRow, Choices, Field } from '@/components/app/form-field';
import { FilePicker } from '@/components/app/file-picker';
import { Page, PageHeader, Panel, Section } from '@/components/app/page';
import { Async } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { api } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';

interface Status {
  mode: 'oauth' | 'service' | null; terhubung: boolean; email: string | null;
  client_id: string; ada_client_secret: boolean; ada_kunci_layanan: boolean;
  folder_id: string | null; folder_url: string | null; spreadsheet_id: string | null; spreadsheet_url: string | null;
  sinkron_otomatis: boolean; sinkron_tiap_jam: number; terhubung_pada: string | null; redirect_uri: string;
  lampiran: { total: number; tersinkron: number };
  proses: { berjalan: boolean; mulai: string | null; selesai: string | null; galat: string | null; hasil: { file_baru: number; file_gagal: number; file_sisa: number; lembar: number; baris: number } | null };
}

const INTERVALS = [[1, 'Setiap jam'], [3, 'Setiap 3 jam'], [6, 'Setiap 6 jam'], [12, 'Dua kali sehari'], [24, 'Sekali sehari']] as const;

export function GooglePage() {
  const params = useSearchParams();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['google'], queryFn: () => api.get<Status>('/google'),
    refetchInterval: (s) => (s.state.data?.proses.berjalan ? 1500 : false),
  });
  // Pesan dari balasan Google (OAuth) dibawa lewat alamat; tampilkan sekali lalu bersihkan alamatnya.
  const [notice] = useState(() => ({ ok: params.get('berhasil'), err: params.get('galat') }));
  useEffect(() => { if (notice.ok || notice.err) router.replace('/google'); }, [notice, router]);
  const sync = useAction(() => api.post<Status>('/google/sinkron'), { keys: ['google'], success: 'Sinkronisasi dimulai. Kemajuannya tampil di halaman ini.' });
  return (
    <Page wide className="max-w-6xl">
      <PageHeader title="Google Drive & Spreadsheet"
        intro="Lampiran surat tersalin ke Google Drive dalam folder yang tersusun, dan daftar surat tersalin ke Google Spreadsheet untuk dibaca pimpinan.">
        {q.data?.terhubung && (
          <Button disabled={sync.isPending || q.data.proses.berjalan} onClick={() => sync.mutate()}>
            <RefreshCwIcon aria-hidden className={q.data.proses.berjalan ? 'animate-spin' : undefined} /> {q.data.proses.berjalan ? 'Menyinkronkan…' : 'Sinkronkan Sekarang'}
          </Button>
        )}
      </PageHeader>
      {notice.ok && <Alert variant="ok"><CheckCircle2Icon aria-hidden /> {notice.ok}</Alert>}
      {notice.err && <Alert variant="late">{notice.err}</Alert>}
      <Async q={q} isEmpty={() => false}>
        {(s) => (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <StatusPanel s={s} />
              <Layout />
            </div>
            <ConnectionForm key={`${s.mode}-${s.terhubung}`} s={s} />
          </div>
        )}
      </Async>
    </Page>
  );
}

function StatusPanel({ s }: { s: Status }) {
  const p = s.proses;
  const pct = s.lampiran.total ? Math.round((s.lampiran.tersinkron / s.lampiran.total) * 100) : 100;
  return (
    <Section title="Keadaan sekarang">
      <Panel className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={s.terhubung ? 'ok' : 'neutral'}>{s.terhubung ? 'Terhubung' : 'Belum terhubung'}</Badge>
          {s.terhubung && <span className="text-sm text-muted-foreground">{s.mode === 'service' ? 'Akun layanan' : 'Akun Google'}: <span className="font-medium text-foreground">{s.email}</span></span>}
        </div>
        {s.terhubung && (
          <>
            <div className="flex flex-wrap gap-2">
              {s.folder_url && <Button asChild size="sm" variant="outline"><a href={s.folder_url} target="_blank" rel="noreferrer"><FolderIcon aria-hidden /> Buka Folder Drive <ExternalLinkIcon aria-hidden /></a></Button>}
              {s.spreadsheet_url && <Button asChild size="sm" variant="outline"><a href={s.spreadsheet_url} target="_blank" rel="noreferrer"><SheetIcon aria-hidden /> Buka Spreadsheet <ExternalLinkIcon aria-hidden /></a></Button>}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-sm"><span>Lampiran di Drive</span><span className="tabular-nums text-muted-foreground">{s.lampiran.tersinkron} dari {s.lampiran.total}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Lampiran yang sudah ada di Drive" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Sinkron terakhir</dt>
              <dd aria-live="polite">{p.berjalan ? 'Sedang berjalan…' : p.selesai ? fmtDateTime(p.selesai) : 'Belum pernah'}</dd>
              {p.hasil && !p.berjalan && <><dt className="text-muted-foreground">Hasil</dt><dd>{p.hasil.file_baru} file baru, {p.hasil.lembar} lembar ({p.hasil.baris} baris)</dd></>}
              <dt className="text-muted-foreground">Otomatis</dt>
              <dd>{s.sinkron_otomatis ? INTERVALS.find(([h]) => h === s.sinkron_tiap_jam)?.[1] : 'Tidak, hanya saat ditekan'}</dd>
            </dl>
            {p.galat && !p.berjalan && <Alert variant="late">{p.galat}</Alert>}
          </>
        )}
        {!s.terhubung && <p className="text-sm text-muted-foreground">Isi cara terhubung di samping. Setelah terhubung, tekan Sinkronkan Sekarang.</p>}
      </Panel>
    </Section>
  );
}

/** Gambaran susunan folder dan lembar, agar admin tahu di mana mencari sebelum membuka Drive. */
function Layout() {
  const tree: [number, string][] = [
    [0, 'Sistem Surat (atau folder pilihan Anda)'], [1, 'Surat Masuk'], [2, '2026'], [3, '10 Oktober'], [4, 'SM-2026-000123 Undangan rapat koordinasi'],
    [1, 'Surat Keluar'], [2, '2026 / 10 Oktober / SK-2026-000045 …'], [1, 'Cadangan'], [1, 'Rekap Sistem Surat (spreadsheet)'],
  ];
  return (
    <Section title="Susunan di Google" intro="Folder dibuat otomatis. File yang sudah tersalin tidak diunggah ulang.">
      <Panel className="grid gap-5 p-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold">Google Drive <span className="font-normal text-muted-foreground">(contoh)</span></h3>
          <ul className="flex flex-col gap-1 text-sm" aria-label="Contoh susunan folder">
            {tree.map(([d, t], i) => (
              <li key={i} className="flex items-center gap-2" style={{ paddingLeft: `${d * 14}px` }}>
                {t.includes('spreadsheet') ? <SheetIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                <span className="truncate">{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold">Lembar di spreadsheet</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            <li><span className="font-medium">Ringkasan</span> <span className="text-muted-foreground">jumlah per status</span></li>
            <li><span className="font-medium">Surat Masuk</span> <span className="text-muted-foreground">agenda, pengirim, posisi, tenggat</span></li>
            <li><span className="font-medium">Surat Keluar</span> <span className="text-muted-foreground">nomor, tujuan, status</span></li>
            <li><span className="font-medium">Tugas</span> <span className="text-muted-foreground">penanggung jawab, progres</span></li>
            <li><span className="font-medium">Instansi</span> <span className="text-muted-foreground">daftar instansi</span></li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Lembar ditulis ulang setiap sinkronisasi. Catatan tambahan sebaiknya di lembar lain.</p>
        </div>
      </Panel>
    </Section>
  );
}

function ConnectionForm({ s }: { s: Status }) {
  const [mode, setMode] = useState<'oauth' | 'service'>(s.mode || 'oauth');
  const [v, setV] = useState({
    client_id: s.client_id, client_secret: '', folder: s.folder_url || '', spreadsheet: s.spreadsheet_url || '',
    sinkron_otomatis: s.sinkron_otomatis, sinkron_tiap_jam: s.sinkron_tiap_jam,
  });
  const [keyFile, setKeyFile] = useState<File[]>([]);
  const [confirmOff, setConfirmOff] = useState(false);
  const save = useAction(async () => api.put<Status>('/google', { mode, ...v, service_json: keyFile[0] ? await keyFile[0].text() : undefined }), {
    keys: ['google'], success: 'Pengaturan Google disimpan.', onDone: () => setKeyFile([]),
  });
  const test = useAction(() => api.post<{ pesan: string }>('/google/uji'), { success: (r) => r.pesan });
  const connect = useAction(() => api.post<{ url: string }>('/google/hubungkan'), { onDone: (r) => window.location.assign(r.url) });
  const off = useAction(() => api.del('/google'), { keys: ['google'], success: 'Sambungan Google diputus. File di Drive tidak dihapus.', onDone: () => setConfirmOff(false) });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const copy = async () => { try { await navigator.clipboard.writeText(s.redirect_uri); toast.success('Alamat disalin.'); } catch { toast.error('Tidak dapat menyalin. Pilih teksnya lalu salin manual.'); } };
  const savedMode = s.mode === mode;
  return (
    <Section title="Cara terhubung">
      <Card><CardContent>
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Choices legend="Pilih akun yang dipakai">
            <RadioGroup value={mode} onValueChange={(x) => setMode(x as 'oauth' | 'service')}>
              <ChoiceRow><RadioGroupItem value="oauth" /><span><span className="font-semibold">Akun Google kantor</span> <span className="text-muted-foreground">(Gmail biasa). Paling mudah.</span></span></ChoiceRow>
              <ChoiceRow><RadioGroupItem value="service" /><span><span className="font-semibold">Akun layanan</span> <span className="text-muted-foreground">(Google Workspace dengan Shared Drive)</span></span></ChoiceRow>
            </RadioGroup>
          </Choices>

          {mode === 'oauth' ? (
            <>
              <ol className="flex list-decimal flex-col gap-1.5 rounded-xl bg-muted px-4 py-3 pl-8 text-sm">
                <li>Di Google Cloud Console, aktifkan <b>Google Drive API</b> dan <b>Google Sheets API</b>.</li>
                <li>Buat <b>OAuth client ID</b> jenis <i>Web application</i>, lalu tambahkan alamat di bawah sebagai <i>Authorized redirect URI</i>.</li>
                <li>Tempel Client ID dan Client Secret di sini, simpan, lalu tekan Hubungkan Akun Google.</li>
              </ol>
              <Field label="Alamat pengalihan (redirect URI)">
                {(p) => (
                  <div className="flex gap-2">
                    <Input {...p} readOnly value={s.redirect_uri} onFocus={(e) => e.currentTarget.select()} />
                    <Button type="button" variant="outline" size="icon" aria-label="Salin alamat pengalihan" onClick={copy}><CopyIcon aria-hidden /></Button>
                  </div>
                )}
              </Field>
              <Field label="Client ID" required>{(p) => <Input {...p} value={v.client_id} onChange={set('client_id')} placeholder="…apps.googleusercontent.com" />}</Field>
              <Field label="Client Secret" required={!s.ada_client_secret} hint={s.ada_client_secret ? 'Sudah tersimpan. Kosongkan bila tidak diganti.' : undefined}>
                {(p) => <Input {...p} type="password" autoComplete="off" value={v.client_secret} onChange={set('client_secret')} />}
              </Field>
            </>
          ) : (
            <>
              <ol className="flex list-decimal flex-col gap-1.5 rounded-xl bg-muted px-4 py-3 pl-8 text-sm">
                <li>Di Google Cloud Console, aktifkan Google Drive API dan Google Sheets API, lalu buat akun layanan dan unduh kuncinya (JSON).</li>
                <li>Di Shared Drive, tambahkan email akun layanan sebagai <b>Pengelola konten</b>.</li>
                <li>Unggah file JSON dan tempel tautan folder Shared Drive di bawah.</li>
              </ol>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">File kunci akun layanan (JSON)</span>
                <FilePicker files={keyFile} onChange={setKeyFile} multiple={false} accept=".json,application/json" label="Pilih File JSON"
                  hint={s.ada_kunci_layanan && s.mode === 'service' ? `Tersimpan untuk ${s.email}. Unggah lagi hanya bila ingin mengganti.` : undefined} />
              </div>
            </>
          )}

          <Field label={mode === 'service' ? 'Folder tujuan di Shared Drive' : 'Folder tujuan (boleh kosong)'} required={mode === 'service'}
            hint={mode === 'service' ? 'Tempel tautan folder dari Google Drive.' : 'Kosong: dibuat folder "Sistem Surat" di Drive akun tersebut.'}>
            {(p) => <Input {...p} value={v.folder} onChange={set('folder')} placeholder="https://drive.google.com/drive/folders/…" />}
          </Field>
          <Field label="Spreadsheet rekap (boleh kosong)" hint="Kosong: dibuat otomatis di folder tujuan pada sinkronisasi pertama.">
            {(p) => <Input {...p} value={v.spreadsheet} onChange={set('spreadsheet')} placeholder="https://docs.google.com/spreadsheets/d/…" />}
          </Field>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <ChoiceRow className="flex-1"><Checkbox checked={v.sinkron_otomatis} onCheckedChange={(c) => setV({ ...v, sinkron_otomatis: c === true })} /><span>Sinkronkan otomatis</span></ChoiceRow>
            <Field label="Seberapa sering" className="sm:w-48">
              {(p) => (
                <NativeSelect {...p} disabled={!v.sinkron_otomatis} value={v.sinkron_tiap_jam} onChange={(e) => setV({ ...v, sinkron_tiap_jam: Number(e.target.value) })}>
                  {INTERVALS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
                </NativeSelect>
              )}
            </Field>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" variant="dark" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan Pengaturan'}</Button>
            {mode === 'oauth' && savedMode && s.client_id && (
              <Button type="button" variant="outline" disabled={connect.isPending} onClick={() => connect.mutate()}>
                <LinkIcon aria-hidden /> {s.terhubung ? 'Hubungkan Ulang' : 'Hubungkan Akun Google'}
              </Button>
            )}
            {s.terhubung && savedMode && <Button type="button" variant="outline" disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Menguji…' : 'Uji Sambungan'}</Button>}
            {s.terhubung && <Button type="button" variant="destructive" onClick={() => setConfirmOff(true)}><UnplugIcon aria-hidden /> Putuskan</Button>}
          </div>
        </form>
      </CardContent></Card>
      <ActionDialog open={confirmOff} onOpenChange={setConfirmOff} danger title="Putuskan sambungan Google?" confirmLabel="Putuskan Sambungan"
        pending={off.isPending} onConfirm={() => off.mutate()}
        description="Sinkronisasi dan salinan cadangan ke Drive berhenti. File dan spreadsheet yang sudah ada di Google tetap ada." />
    </Section>
  );
}
