'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CameraIcon, FileUpIcon, KeyboardIcon, ScanTextIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useInstansiOptions, useRefValues } from '@/features/reference/api';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/app/form-field';
import { FilePicker } from '@/components/app/file-picker';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Loading } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { PRIORITAS, SIFAT } from '@/domain/letter-in';
import { REF_KATEGORI } from '@/domain/reference';

/** Nilai lama yang sudah tidak ada di daftar tetap ditampilkan agar tidak hilang diam-diam. */
const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list);
import { api } from '@/lib/api-client';
import { todayIso } from '@/lib/format';

const EMPTY = { no_surat: '', tgl_surat: todayIso(), tgl_diterima: todayIso(), asal: '', instansi: '', alamat: '', perihal: '', jenis: 'Surat Dinas', sifat: 'Biasa', prioritas: 'Normal', lampiran: '', catatan: '' };
type Form = typeof EMPTY;
interface Ocr { fields: Record<string, { value: string; conf: number; review?: boolean }>; quality: { meanConf: number; warnings: string[]; engine?: string }; failed?: boolean; preview?: string }

/** Penanda isian hasil foto yang kurang yakin terbaca: kotak kuning dan kalimat "Periksa isian ini". */
function OcrNote({ ocr, k }: { ocr: Ocr | null; k: string }) {
  if (!ocr || ocr.failed) return null;
  const c = ocr.fields[k];
  if (c && !c.review) return null;
  return <p className="rounded-lg bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">{c ? 'Kurang jelas terbaca. Periksa dengan surat aslinya.' : 'Tidak terbaca. Ketik sendiri.'}</p>;
}

export function NewLetterInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'pilih' | 'foto' | 'ketik'>('pilih');
  const [f, setF] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [ocr, setOcr] = useState<Ocr | null>(null);
  const [reading, setReading] = useState(false);
  const [errs, setErrs] = useState<Partial<Record<keyof Form, string>>>({});
  const cam = useRef<HTMLInputElement>(null);
  const sifatList = useRefValues('sifat', SIFAT);
  const jenisList = useRefValues('jenis_surat', REF_KATEGORI.jenis_surat.defaults);
  const instansiList = useInstansiOptions().data || [];
  const gal = useRef<HTMLInputElement>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => () => { if (photo?.url.startsWith('blob:')) URL.revokeObjectURL(photo.url); }, [photo]);

  const readPhoto = async (file?: File) => {
    if (!file) return;
    const pdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!pdf && !/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Gunakan foto JPG, PNG, WebP, atau file PDF.'); return; }
    setMode('foto'); setReading(true); setOcr(null);
    setPhoto({ file, url: pdf ? '' : URL.createObjectURL(file) });
    try {
      const r = await api.upload<Ocr>('/ocr/surat-masuk', {}, { foto: file });
      setOcr(r);
      if (r.preview) setPhoto({ file, url: r.preview });
      const g = (k: string) => r.fields[k]?.value;
      setF((s) => ({ ...s, no_surat: g('no_surat') || '', tgl_surat: g('tgl_surat') || s.tgl_surat, asal: g('asal') || '', instansi: g('instansi') || '', alamat: g('alamat') || '', perihal: g('perihal') || '', sifat: g('sifat') || 'Biasa', lampiran: g('lampiran') || '' }));
    } catch (e) {
      toast.error((e as Error).message);
      setOcr({ fields: {}, quality: { warnings: [(e as Error).message], meanConf: 0 }, failed: true });
    } finally {
      setReading(false);
    }
  };

  const save = useAction(() => api.upload<{ id: number; no_agenda: string }>('/letters-in', f, { files: [...(photo ? [photo.file] : []), ...files] }), {
    success: (r) => `Surat dicatat dengan nomor agenda ${r.no_agenda}. Tanda terima siap dicetak.`, keys: ['letters-in', 'dashboard'], onDone: (r) => router.push(`/surat-masuk/${r.id}/tanda-terima?baru=1`),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: typeof errs = {};
    if (!f.perihal.trim()) er.perihal = 'Perihal wajib diisi.';
    if (!f.no_surat.trim()) er.no_surat = 'Nomor surat wajib diisi.';
    if (!f.asal.trim()) er.asal = 'Pengirim wajib diisi.';
    if (f.tgl_diterima < f.tgl_surat) er.tgl_diterima = 'Tanggal diterima tidak boleh sebelum tanggal surat.';
    setErrs(er);
    if (Object.keys(er).length) { toast.error('Ada isian yang perlu dilengkapi. Lihat tulisan merah di formulir.'); return; }
    save.mutate();
  };

  if (mode === 'pilih') {
    return (
      <Page>
        <PageHeader back={{ href: '/surat-masuk', label: 'Surat Masuk' }} title="Catat surat masuk" intro="Pilih cara mencatat. Nomor agenda, batas waktu, dan kode lacak untuk pengirim dibuat otomatis." />
        <div className="grid gap-5 md:grid-cols-2">
          <Card className="overflow-hidden"><CardContent className="flex h-full flex-col gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><ScanTextIcon className="size-6" aria-hidden /></span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">Baca dari foto atau PDF</h2>
              <p className="text-sm text-muted-foreground">Sistem membaca nomor, tanggal, pengirim, dan perihal dari halaman pertama. Anda tinggal memeriksa dan menyimpan.</p>
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              <li>Foto di meja yang rata dan terang, seluruh halaman masuk.</li>
              <li>File PDF diubah menjadi gambar halaman pertama sebelum dibaca.</li>
            </ul>
            <div className="mt-auto flex flex-col gap-2 sm:flex-row">
              <Button onClick={() => cam.current?.click()}><CameraIcon aria-hidden /> Ambil foto</Button>
              <Button variant="outline" onClick={() => gal.current?.click()}><FileUpIcon aria-hidden /> Pilih foto atau PDF</Button>
            </div>
            <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files?.[0])} />
            <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files?.[0])} />
          </CardContent></Card>
          <Card><CardContent className="flex h-full flex-col gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink"><KeyboardIcon className="size-6" aria-hidden /></span>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-bold">Ketik sendiri</h2>
              <p className="text-sm text-muted-foreground">Isi data surat dengan mengetik, lalu lampirkan file suratnya bila ada.</p>
            </div>
            <div className="mt-auto"><Button variant="outline" onClick={() => setMode('ketik')}><KeyboardIcon aria-hidden /> Ketik sendiri</Button></div>
          </CardContent></Card>
        </div>
      </Page>
    );
  }

  const lowCount = ocr && !ocr.failed ? ['no_surat', 'tgl_surat', 'asal', 'perihal'].filter((k) => !ocr.fields[k] || ocr.fields[k].review).length : 0;

  const pickInstansi = (v: string) => {
    const hit = instansiList.find((x) => x.nama.toLowerCase() === v.toLowerCase());
    setF((cur) => ({ ...cur, instansi: v, alamat: hit && !cur.alamat ? hit.alamat || '' : cur.alamat }));
  };
  const form = (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Section title="Isi surat">
        <Card><CardContent className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Perihal" required error={errs.perihal}>{(p) => <><Textarea {...p} rows={2} value={f.perihal} onChange={set('perihal')} /><OcrNote ocr={ocr} k="perihal" /></>}</Field>
          <Field label="Nomor surat" required error={errs.no_surat} hint="Ditulis persis seperti di surat.">{(p) => <><Input {...p} value={f.no_surat} onChange={set('no_surat')} /><OcrNote ocr={ocr} k="no_surat" /></>}</Field>
          <Field label="Tanggal surat" required>{(p) => <><Input {...p} type="date" value={f.tgl_surat} onChange={set('tgl_surat')} /><OcrNote ocr={ocr} k="tgl_surat" /></>}</Field>
          <Field label="Jenis surat" required>{(p) => <NativeSelect {...p} value={f.jenis} onChange={set('jenis')}>{withCurrent(jenisList, f.jenis).map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
          <Field label="Sifat surat" required>{(p) => <><NativeSelect {...p} value={f.sifat} onChange={set('sifat')}>{withCurrent(sifatList, f.sifat).map((x) => <option key={x}>{x}</option>)}</NativeSelect><OcrNote ocr={ocr} k="sifat" /></>}</Field>
          <Field label="Lampiran" hint="Contoh: 1 berkas.">{(p) => <Input {...p} value={f.lampiran} onChange={set('lampiran')} />}</Field>
        </CardContent></Card>
      </Section>
      <Section title="Pengirim">
        <Card><CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Pengirim (nama atau jabatan)" required error={errs.asal}>{(p) => <><Input {...p} value={f.asal} onChange={set('asal')} placeholder="Contoh: Kepala Sekolah" /><OcrNote ocr={ocr} k="asal" /></>}</Field>
          <Field label="Instansi pengirim" hint="Ketik untuk memilih dari daftar instansi, atau tulis yang baru.">{(p) => <>
            <Input {...p} list="daftar-instansi" value={f.instansi} onChange={(e) => pickInstansi(e.target.value)} autoComplete="off" />
            <datalist id="daftar-instansi">{instansiList.map((x) => <option key={x.id} value={x.nama}>{x.singkatan || ''}</option>)}</datalist>
            <OcrNote ocr={ocr} k="instansi" />
          </>}</Field>
          <Field className="sm:col-span-2" label="Alamat pengirim">{(p) => <Input {...p} value={f.alamat} onChange={set('alamat')} />}</Field>
        </CardContent></Card>
      </Section>
      <Section title="Penerimaan">
        <Card><CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal diterima" required error={errs.tgl_diterima}>{(p) => <Input {...p} type="date" value={f.tgl_diterima} onChange={set('tgl_diterima')} />}</Field>
          <Field label="Prioritas" required hint="Menentukan batas waktu penyelesaian.">{(p) => <NativeSelect {...p} value={f.prioritas} onChange={set('prioritas')}>{PRIORITAS.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
          <Field className="sm:col-span-2" label="Catatan penerimaan">{(p) => <Input {...p} value={f.catatan} onChange={set('catatan')} />}</Field>
          {mode === 'ketik' && (
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-sm font-semibold">File surat</span>
              <FilePicker files={files} onChange={setFiles} accept=".pdf,.png,.jpg,.jpeg,.docx" label="Pilih file surat" hint="PDF, foto, atau Word. Maks 15 MB per file." />
            </div>
          )}
        </CardContent></Card>
      </Section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="outline"><Link href="/surat-masuk">Batal</Link></Button>
        <Button type="submit" disabled={save.isPending || reading}>{save.isPending ? 'Menyimpan…' : 'Simpan dan beri nomor agenda'}</Button>
      </div>
    </form>
  );

  if (mode === 'ketik') {
    return (
      <Page>
        <PageHeader back={{ href: '/surat-masuk', label: 'Surat Masuk' }} title="Catat surat masuk" intro="Isi data surat, lalu simpan.">
          <Button variant="outline" onClick={() => setMode('pilih')}>Ganti cara mencatat</Button>
        </PageHeader>
        {form}
      </Page>
    );
  }

  return (
    <Page wide>
      <PageHeader back={{ href: '/surat-masuk', label: 'Surat Masuk' }} title="Periksa hasil pembacaan" intro="Bandingkan isian dengan surat aslinya. Isian bertanda kuning perlu diperiksa."
        meta={ocr && !ocr.failed ? <Badge tone={ocr.quality.engine === 'gemini' ? 'yellow' : 'neutral'}>{ocr.quality.engine === 'gemini' ? 'Dibaca dengan Gemini AI' : 'Dibaca dengan pembaca bawaan'}</Badge> : undefined}>
        <Button variant="outline" onClick={() => { setMode('pilih'); setPhoto(null); setOcr(null); setF(EMPTY); }}>Ganti file</Button>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-[5fr_6fr]">
        <figure className="overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-20">
          {photo?.url ? <img src={photo.url} alt="Halaman surat yang dibaca" className="block max-h-[80vh] w-full object-contain" /> : <div className="p-6"><Loading label="Menyiapkan tampilan halaman PDF…" rows={4} /></div>}
        </figure>
        <div className="flex flex-col gap-5">
          {reading ? (
            <Card><CardContent className="flex flex-col gap-2"><p className="font-semibold">Sedang membaca surat…</p><p className="text-sm text-muted-foreground">Biasanya 5 sampai 15 detik. Jangan tutup halaman ini.</p><Loading rows={3} /></CardContent></Card>
          ) : ocr && (
            <>
              {ocr.quality.warnings.map((w) => <Alert key={w} variant="warn">{w}</Alert>)}
              {!ocr.failed && <Alert variant={lowCount ? 'warn' : 'ok'}>{lowCount ? `${lowCount} isian perlu Anda periksa (bertanda kuning). Isian lain terbaca jelas, tetapi tetap cocokkan sebelum menyimpan.` : 'Semua isian utama terbaca jelas. Tetap cocokkan dengan surat sebelum menyimpan.'}</Alert>}
              {form}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
