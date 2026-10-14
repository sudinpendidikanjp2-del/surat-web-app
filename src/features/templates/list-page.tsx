'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { ActionDialog } from '@/components/app/action-dialog';
import { FilePicker } from '@/components/app/file-picker';
import { Field } from '@/components/app/form-field';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useTemplates } from '@/features/letters-out/api';
import { useRefValues } from '@/features/reference/api';
import { REF_KATEGORI } from '@/domain/reference';
import { api } from '@/lib/api-client';

export function TemplatesPage() {
  const q = useTemplates();
  const [adding, setAdding] = useState(false);
  return (
    <Page>
      <PageHeader title="Template Surat"
        intro="Bentuk surat keluar dalam file Word (DOCX). Bagian yang diisi ditulis seperti {{perihal}} di dalam dokumen.">
        <Button onClick={() => setAdding(true)}><PlusIcon aria-hidden /> Tambah Template</Button>
      </PageHeader>
      <Async q={q} empty={<Empty title="Belum ada template" text="Tambahkan template pertama agar pegawai dapat membuat surat keluar." />}>
        {(rows) => (
          <ul className="flex flex-col gap-3">
            {rows.map((t) => (
              <li key={t.id}><Card><CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{t.jenis}</Badge>
                  {!t.aktif && <Badge tone="late">Tidak dipakai</Badge>}
                  {t.aktif && !t.versi_aktif_id && <Badge tone="warn">Belum ada versi yang dipakai</Badge>}
                </div>
                <Link href={`/template/${t.id}`} className="font-semibold text-foreground">{t.nama}</Link>
                {t.deskripsi && <p>{t.deskripsi}</p>}
                <p className="text-muted-foreground">{t.versi_aktif ? `Versi ${t.versi_aktif} sedang dipakai` : 'Belum ada versi dipakai'}, {t.jumlah_versi} versi tersimpan.</p>
              </CardContent></Card></li>
            ))}
          </ul>
        )}
      </Async>
      {adding && <NewTemplateDialog onClose={() => setAdding(false)} />}
    </Page>
  );
}

function NewTemplateDialog({ onClose }: { onClose: () => void }) {
  const jenisList = useRefValues('jenis_surat', REF_KATEGORI.jenis_surat.defaults);
  const router = useRouter();
  const [v, setV] = useState({ nama: '', kode: '', jenis: '', deskripsi: '', kode_klasifikasi: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(() => api.upload<{ id: number }>('/templates', v, { file: files[0] }), {
    success: 'Template sudah ditambahkan dan langsung dapat dipakai.', keys: ['templates'], onDone: (d) => router.push(`/template/${d.id}`),
  });
  const put = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Tambah template" error={err || save.error?.message} confirmLabel="Simpan Template" pending={save.isPending}
      onConfirm={() => {
        if (!v.nama || !v.kode || !v.jenis) return setErr('Nama, kode, dan jenis surat wajib diisi.');
        if (!files[0]) return setErr('Pilih file template berformat DOCX.');
        setErr(null); save.mutate();
      }}>
      <div className="flex flex-col gap-5">
        <Field label="Nama template" required hint="Misalnya: Surat Undangan Rapat">{(p) => <Input {...p} value={v.nama} onChange={put('nama')} />}</Field>
        <Field label="Jenis surat" required hint="Pilih dari daftar jenis surat di Data Referensi, atau ketik yang lain.">{(p) => <><Input {...p} list="jenis-surat" value={v.jenis} onChange={put('jenis')} autoComplete="off" /><datalist id="jenis-surat">{jenisList.map((x) => <option key={x} value={x} />)}</datalist></>}</Field>
        <Field label="Kode template" required hint="Huruf kecil, angka, dan strip. Misalnya: undangan-rapat">{(p) => <Input {...p} value={v.kode} autoCapitalize="none" onChange={(e) => setV((s) => ({ ...s, kode: e.target.value.toLowerCase() }))} />}</Field>
        <Field label="Kode klasifikasi" hint="Dipakai pada nomor surat. Bila kosong, memakai kode bawaan kantor.">{(p) => <Input {...p} value={v.kode_klasifikasi} onChange={put('kode_klasifikasi')} />}</Field>
        <Field label="Keterangan">{(p) => <Textarea {...p} value={v.deskripsi} onChange={put('deskripsi')} />}</Field>
        <FilePicker files={files} onChange={setFiles} multiple={false} accept=".docx" label="Pilih File DOCX" />
      </div>
    </ActionDialog>
  );
}
