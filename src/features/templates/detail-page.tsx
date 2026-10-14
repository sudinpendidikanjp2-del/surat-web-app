'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionDialog } from '@/components/app/action-dialog';
import { FilePicker } from '@/components/app/file-picker';
import { Field } from '@/components/app/form-field';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Loading, ErrorState } from '@/components/app/states';
import { Stamp } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import type { TemplateField } from '@/domain/letter-out';
import { useTemplate, type TemplateDetail } from '@/features/letters-out/api';
import { useRefValues } from '@/features/reference/api';
import { REF_KATEGORI } from '@/domain/reference';
import { api } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';

type Version = TemplateDetail['versions'][number];
type Open = { kind: 'edit' } | { kind: 'upload' } | { kind: 'fields'; v: Version } | { kind: 'preview'; v: Version } | { kind: 'activate'; v: Version } | null;

const TYPE_LABEL: Record<TemplateField['type'], string> = { text: 'Satu baris', textarea: 'Beberapa baris', date: 'Tanggal' };

export function TemplateDetailPage({ id }: { id: string }) {
  const q = useTemplate(id);
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  return (
    <Page>
      <Async q={q} isEmpty={() => false}>
        {({ template: t, versions }) => (
          <>
            <PageHeader title={t.nama} back={{ href: '/template', label: 'Template Surat' }}
              intro={`${t.jenis}. ${t.aktif ? 'Sedang dapat dipilih saat membuat surat keluar.' : 'Tidak dipakai: tidak muncul saat membuat surat keluar.'}`}>
              <Button onClick={() => setOpen({ kind: 'upload' })}>Unggah Versi Baru</Button>
              <Button variant="outline" onClick={() => setOpen({ kind: 'edit' })}>Ubah Keterangan</Button>
            </PageHeader>
            <Section title="Versi template" intro="Hanya satu versi yang dipakai untuk surat baru. Surat yang sudah dibuat tetap memakai versinya sendiri.">
              <ol className="flex flex-col gap-3">
                {versions.map((v) => (
                  <li key={v.id}><Card className={v.aktif ? 'border-primary' : ''}><CardContent className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">Versi {v.versi}</span>
                      {v.aktif && <Badge tone="ok">Sedang dipakai</Badge>}
                    </div>
                    {v.catatan && <p>{v.catatan}</p>}
                    <p className="text-muted-foreground">Diunggah {fmtDateTime(v.created_at)}{v.dibuat_oleh ? ` oleh ${v.dibuat_oleh}` : ''}. {v.fields.length} isian.</p>
                    <div className="flex flex-wrap gap-3">
                      <Button variant="outline" onClick={() => setOpen({ kind: 'preview', v })}>Lihat Contoh</Button>
                      <Button variant="outline" onClick={() => setOpen({ kind: 'fields', v })}>Atur Isian</Button>
                      <Button asChild variant="outline" className="no-underline"><a href={`/api/templates/${t.id}/versi/${v.id}/unduh`}>Unduh File DOCX</a></Button>
                      {!v.aktif && <Button onClick={() => setOpen({ kind: 'activate', v })}>Pakai Versi Ini</Button>}
                    </div>
                  </CardContent></Card></li>
                ))}
              </ol>
            </Section>
            {open?.kind === 'edit' && <EditDialog t={t} onClose={close} />}
            {open?.kind === 'upload' && <UploadDialog id={t.id} onClose={close} />}
            {open?.kind === 'fields' && <FieldsDialog id={t.id} v={open.v} onClose={close} />}
            {open?.kind === 'preview' && <PreviewDialog id={t.id} v={open.v} onClose={close} />}
            {open?.kind === 'activate' && <ActivateDialog id={t.id} v={open.v} onClose={close} />}
          </>
        )}
      </Async>
    </Page>
  );
}

const KEYS = ['template', 'templates'];

function EditDialog({ t, onClose }: { t: TemplateDetail['template']; onClose: () => void }) {
  const jenisList = useRefValues('jenis_surat', REF_KATEGORI.jenis_surat.defaults);
  const [v, setV] = useState({ nama: t.nama, jenis: t.jenis, deskripsi: t.deskripsi || '', kode_klasifikasi: t.kode_klasifikasi || '', aktif: t.aktif });
  const save = useAction(() => api.put(`/templates/${t.id}`, v), { success: 'Keterangan template sudah disimpan.', keys: KEYS, onDone: onClose });
  const put = (k: 'nama' | 'jenis' | 'deskripsi' | 'kode_klasifikasi') => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Ubah keterangan template" error={save.error?.message} confirmLabel="Simpan Perubahan" pending={save.isPending} onConfirm={() => save.mutate()}>
      <div className="flex flex-col gap-5">
        <Field label="Nama template" required>{(p) => <Input {...p} value={v.nama} onChange={put('nama')} />}</Field>
        <Field label="Jenis surat" required hint="Pilih dari daftar jenis surat di Data Referensi, atau ketik yang lain.">{(p) => <><Input {...p} list="jenis-surat" value={v.jenis} onChange={put('jenis')} autoComplete="off" /><datalist id="jenis-surat">{jenisList.map((x) => <option key={x} value={x} />)}</datalist></>}</Field>
        <Field label="Kode klasifikasi">{(p) => <Input {...p} value={v.kode_klasifikasi} onChange={put('kode_klasifikasi')} />}</Field>
        <Field label="Keterangan">{(p) => <Textarea {...p} value={v.deskripsi} onChange={put('deskripsi')} />}</Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm">
          <Checkbox checked={v.aktif} onCheckedChange={(c) => setV((s) => ({ ...s, aktif: c === true }))} /> Dapat dipilih saat membuat surat keluar
        </label>
      </div>
    </ActionDialog>
  );
}

function UploadDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [catatan, setCatatan] = useState('');
  const [aktifkan, setAktifkan] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(() => api.upload(`/templates/${id}/versi`, { catatan, aktifkan: String(aktifkan) }, { file: files[0] }), {
    success: 'Versi baru sudah diunggah.', keys: KEYS, onDone: onClose,
  });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title="Unggah versi baru" error={err || save.error?.message} confirmLabel="Unggah Versi" pending={save.isPending}
      description="Isian dibaca otomatis dari tulisan {{nama_isian}} di dalam dokumen."
      onConfirm={() => { if (!files[0]) return setErr('Pilih file DOCX terlebih dahulu.'); setErr(null); save.mutate(); }}>
      <div className="flex flex-col gap-5">
        <FilePicker files={files} onChange={setFiles} multiple={false} accept=".docx" label="Pilih File DOCX" />
        <Field label="Apa yang berubah?">{(p) => <Input {...p} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Contoh: alamat kantor diperbarui" />}</Field>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm">
          <Checkbox checked={aktifkan} onCheckedChange={(c) => setAktifkan(c === true)} /> Langsung pakai versi ini untuk surat baru
        </label>
      </div>
    </ActionDialog>
  );
}

function FieldsDialog({ id, v, onClose }: { id: number; v: Version; onClose: () => void }) {
  const [fields, setFields] = useState(v.fields);
  const save = useAction(() => api.put(`/templates/${id}/versi/${v.id}/field`, { fields }), { success: 'Pengaturan isian sudah disimpan.', keys: KEYS, onDone: onClose });
  const set = (name: string, patch: Partial<TemplateField>) => setFields((fs) => fs.map((f) => (f.name === name ? { ...f, ...patch } : f)));
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={`Atur isian versi ${v.versi}`} error={save.error?.message} confirmLabel="Simpan Isian" pending={save.isPending}
      description="Ubah judul isian yang dilihat pegawai saat mengisi surat. Isian yang diisi otomatis oleh sistem tidak dapat diubah." onConfirm={() => save.mutate()}>
      <ol className="flex flex-col gap-4">
        {fields.map((f) => (
          <li key={f.name} className="flex flex-col gap-3 rounded-md border border-border p-4">
            <p className="flex flex-wrap items-center gap-2"><Stamp>{`{{${f.name}}}`}</Stamp>{(f.sistem || f.bawaan) && <Badge>Diisi otomatis</Badge>}</p>
            {f.sistem ? <p className="text-muted-foreground">{f.label}</p> : (
              <>
                <Field label="Judul isian" required>{(p) => <Input {...p} value={f.label} onChange={(e) => set(f.name, { label: e.target.value })} />}</Field>
                <Field label="Bentuk isian" required>
                  {(p) => <NativeSelect {...p} value={f.type} onChange={(e) => set(f.name, { type: e.target.value as TemplateField['type'] })}>{Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</NativeSelect>}
                </Field>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><Checkbox checked={f.required} onCheckedChange={(c) => set(f.name, { required: c === true })} /> Wajib diisi</label>
              </>
            )}
          </li>
        ))}
      </ol>
    </ActionDialog>
  );
}

function PreviewDialog({ id, v, onClose }: { id: number; v: Version; onClose: () => void }) {
  const q = useQuery({ queryKey: ['template-preview', id, v.id], queryFn: () => api.get<{ html: string }>(`/templates/${id}/versi/${v.id}/pratinjau`) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Contoh versi {v.versi}</DialogTitle>
          <DialogDescription>Tulisan dalam kurung siku, misalnya [perihal], akan diganti dengan isian surat.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {q.isPending ? <Loading label="Sedang menyiapkan contoh…" /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} />
            : <div className="preview-doc rounded-md border border-border p-6 sm:p-10" dangerouslySetInnerHTML={{ __html: q.data.html }} />}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function ActivateDialog({ id, v, onClose }: { id: number; v: Version; onClose: () => void }) {
  const save = useAction(() => api.post(`/templates/${id}/versi/${v.id}/aktifkan`), { success: `Versi ${v.versi} sekarang dipakai untuk surat baru.`, keys: KEYS, onDone: onClose });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={`Pakai versi ${v.versi}?`} error={save.error?.message} confirmLabel={`Pakai Versi ${v.versi}`} pending={save.isPending}
      description="Surat keluar yang dibuat mulai sekarang memakai versi ini. Surat yang sudah ada tidak berubah." onConfirm={() => save.mutate()} />
  );
}
