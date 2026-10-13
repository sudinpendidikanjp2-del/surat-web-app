'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CameraIcon, ImageIcon, KeyboardIcon } from 'lucide-react';
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
import { api } from '@/lib/api-client';
import { todayIso } from '@/lib/format';

const EMPTY = { no_surat: '', tgl_surat: todayIso(), tgl_diterima: todayIso(), asal: '', instansi: '', alamat: '', perihal: '', jenis: 'Surat Dinas', sifat: 'Biasa', prioritas: 'Normal', lampiran: '', catatan: '' };
type Form = typeof EMPTY;
interface Ocr { fields: Record<string, { value: string; conf: number; review?: boolean }>; quality: { meanConf: number; warnings: string[] }; failed?: boolean }

/** Penanda isian hasil foto yang kurang yakin terbaca: kotak kuning dan kalimat "Periksa isian ini". */
function OcrNote({ ocr, k }: { ocr: Ocr | null; k: string }) {
  if (!ocr || ocr.failed) return null;
  const c = ocr.fields[k];
  if (c && !c.review) return null;
  return <p className="rounded-sm bg-warn-soft px-3 py-1 font-bold text-warn">{c ? 'Kurang jelas terbaca. Periksa dengan surat aslinya.' : 'Tidak terbaca dari foto. Ketik sendiri.'}</p>;
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
  const gal = useRef<HTMLInputElement>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.url); }, [photo]);

  const readPhoto = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Gunakan foto JPG, PNG, atau WebP. Untuk file PDF, pilih "Ketik Sendiri" lalu lampirkan filenya.'); return; }
    setMode('foto'); setReading(true); setOcr(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
    try {
      const r = await api.upload<Ocr>('/ocr/surat-masuk', {}, { foto: file });
      setOcr(r);
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
    success: (r) => `Surat sudah dicatat dengan nomor agenda ${r.no_agenda}.`, keys: ['letters-in', 'dashboard'], onDone: (r) => router.push(`/surat-masuk/${r.id}`),
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
        <PageHeader back={{ href: '/surat-masuk', label: 'Surat Masuk' }} title="Catat surat masuk" intro="Pilih salah satu cara. Nomor agenda diberikan otomatis setelah surat disimpan." />
        <div className="grid gap-5 md:grid-cols-2">
          <Card><CardContent className="flex h-full flex-col gap-4">
            <h2 className="flex items-center gap-2 text-xl"><CameraIcon className="size-7" aria-hidden /> Dari foto surat</h2>
            <p className="text-lg">Foto halaman pertama surat. Sistem membaca nomor, tanggal, pengirim, dan perihal. Anda tinggal memeriksa.</p>
            <p className="text-muted-foreground">Letakkan surat di meja yang rata dan terang. Pastikan seluruh halaman masuk foto.</p>
            <div className="mt-auto flex flex-col gap-3">
              <Button onClick={() => cam.current?.click()}><CameraIcon aria-hidden /> Ambil Foto Surat</Button>
              <Button variant="outline" onClick={() => gal.current?.click()}><ImageIcon aria-hidden /> Pilih Foto yang Sudah Ada</Button>
            </div>
            <input ref={cam} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files?.[0])} />
            <input ref={gal} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files?.[0])} />
          </CardContent></Card>
          <Card><CardContent className="flex h-full flex-col gap-4">
            <h2 className="flex items-center gap-2 text-xl"><KeyboardIcon className="size-7" aria-hidden /> Ketik sendiri</h2>
            <p className="text-lg">Isi data surat dengan mengetik. Cocok untuk surat berupa file PDF atau bila foto sulit dibaca.</p>
            <div className="mt-auto"><Button variant="outline" className="w-full" onClick={() => setMode('ketik')}><KeyboardIcon aria-hidden /> Ketik Sendiri</Button></div>
          </CardContent></Card>
        </div>
      </Page>
    );
  }

  const lowCount = ocr && !ocr.failed ? ['no_surat', 'tgl_surat', 'asal', 'perihal'].filter((k) => !ocr.fields[k] || ocr.fields[k].review).length : 0;

  const form = (
    <form onSubmit={submit} noValidate className="flex flex-col gap-8">
      <Section title="1. Isi surat">
        <Card><CardContent className="flex flex-col gap-5">
          <Field label="Perihal (isi pokok surat)" required error={errs.perihal}>{(p) => <><Textarea {...p} rows={2} value={f.perihal} onChange={set('perihal')} /><OcrNote ocr={ocr} k="perihal" /></>}</Field>
          <Field label="Nomor surat" required error={errs.no_surat} hint="Ditulis persis seperti di surat.">{(p) => <><Input {...p} value={f.no_surat} onChange={set('no_surat')} /><OcrNote ocr={ocr} k="no_surat" /></>}</Field>
          <Field label="Tanggal surat" required>{(p) => <><Input {...p} type="date" value={f.tgl_surat} onChange={set('tgl_surat')} /><OcrNote ocr={ocr} k="tgl_surat" /></>}</Field>
          <Field label="Sifat surat" required>{(p) => <NativeSelect {...p} value={f.sifat} onChange={set('sifat')}>{SIFAT.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
          <Field label="Lampiran" hint="Contoh: 1 berkas.">{(p) => <Input {...p} value={f.lampiran} onChange={set('lampiran')} />}</Field>
        </CardContent></Card>
      </Section>
      <Section title="2. Pengirim">
        <Card><CardContent className="flex flex-col gap-5">
          <Field label="Pengirim (nama atau jabatan)" required error={errs.asal}>{(p) => <><Input {...p} value={f.asal} onChange={set('asal')} placeholder="Contoh: Kepala Sekolah SDN 01" /><OcrNote ocr={ocr} k="asal" /></>}</Field>
          <Field label="Instansi pengirim">{(p) => <Input {...p} value={f.instansi} onChange={set('instansi')} />}</Field>
          <Field label="Alamat pengirim">{(p) => <Input {...p} value={f.alamat} onChange={set('alamat')} />}</Field>
        </CardContent></Card>
      </Section>
      <Section title="3. Penerimaan">
        <Card><CardContent className="flex flex-col gap-5">
          <Field label="Tanggal surat diterima" required error={errs.tgl_diterima}>{(p) => <Input {...p} type="date" value={f.tgl_diterima} onChange={set('tgl_diterima')} />}</Field>
          <Field label="Seberapa mendesak" required hint="Menentukan batas waktu penyelesaian.">{(p) => <NativeSelect {...p} value={f.prioritas} onChange={set('prioritas')}>{PRIORITAS.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
          <Field label="Jenis surat" required>{(p) => <Input {...p} value={f.jenis} onChange={set('jenis')} />}</Field>
          <Field label="Catatan penerimaan">{(p) => <Input {...p} value={f.catatan} onChange={set('catatan')} />}</Field>
          {mode === 'ketik' && (
            <div className="flex flex-col gap-2">
              <span className="font-bold">File surat <span className="font-normal text-muted-foreground">(boleh dikosongkan)</span></span>
              <FilePicker files={files} onChange={setFiles} accept=".pdf,.png,.jpg,.jpeg,.docx" label="Pilih File Surat" hint="PDF, foto, atau Word. Paling besar 15 MB per file." />
            </div>
          )}
        </CardContent></Card>
      </Section>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={save.isPending || reading}>{save.isPending ? 'Sedang menyimpan…' : 'Simpan dan Beri Nomor Agenda'}</Button>
        <Button asChild variant="outline" className="no-underline"><Link href="/surat-masuk">Batal</Link></Button>
      </div>
    </form>
  );

  if (mode === 'ketik') {
    return (
      <Page>
        <PageHeader back={{ href: '/surat-masuk', label: 'Surat Masuk' }} title="Catat surat masuk" intro="Isi data surat di bawah, lalu tekan Simpan.">
          <Button variant="outline" onClick={() => setMode('pilih')}>Ganti Cara Mencatat</Button>
        </PageHeader>
        {form}
      </Page>
    );
  }

  return (
    <Page className="max-w-6xl">
      <PageHeader back={{ href: '/surat-masuk', label: 'Surat Masuk' }} title="Periksa hasil pembacaan foto" intro="Bandingkan isian dengan foto surat. Isian bertanda kuning perlu diperiksa.">
        <Button variant="outline" onClick={() => { setMode('pilih'); setPhoto(null); setOcr(null); setF(EMPTY); }}>Foto Ulang</Button>
      </PageHeader>
      <div className="grid items-start gap-6 lg:grid-cols-[5fr_6fr]">
        <figure className="overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-4">
          {photo && <img src={photo.url} alt="Foto surat yang Anda pilih" className="block max-h-[80vh] w-full object-contain" />}
        </figure>
        <div className="flex flex-col gap-5">
          {reading ? (
            <Card><CardContent><Loading label="Sedang membaca surat. Biasanya 5 sampai 15 detik, jangan tutup halaman ini." rows={3} /></CardContent></Card>
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
