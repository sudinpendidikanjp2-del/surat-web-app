'use client';
import { useState } from 'react';
import { EyeIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/app/form-field';
import { useAction } from '@/components/app/use-action';
import type { TemplateField } from '@/domain/letter-out';
import { api } from '@/lib/api-client';
import type { UserOption } from '@/features/letters-in/api';

export interface LetterValues { perihal: string; tujuan: string; tgl_surat: string; penandatangan_id: number | null; fields: Record<string, string> }

/**
 * Formulir surat dari isian template. Nomor surat tidak diisi: diberikan otomatis setelah pimpinan menyetujui,
 * sehingga tidak ada nomor ganda. Pratinjau menampilkan surat persis seperti hasil cetaknya.
 */
export function LetterForm({ fields, versionId, initial, signers, onSubmit, pending, submitLabel, cancel }: {
  fields: TemplateField[]; versionId: number; initial: LetterValues; signers: UserOption[];
  onSubmit: (v: LetterValues) => void; pending: boolean; submitLabel: string; cancel?: React.ReactNode;
}) {
  const [f, setF] = useState(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string | null>(null);
  const own = fields.filter((x) => !x.sistem && !x.bawaan);
  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.perihal.trim()) e.perihal = 'Perihal wajib diisi.';
    if (!f.tujuan.trim()) e.tujuan = 'Tujuan surat wajib diisi.';
    if (!f.tgl_surat) e.tgl_surat = 'Tanggal surat wajib diisi.';
    setErrs(e);
    if (Object.keys(e).length) toast.error('Ada isian yang perlu dilengkapi. Lihat tulisan merah.');
    return Object.keys(e).length === 0;
  };
  const prev = useAction(() => api.post<{ html: string }>('/letters-out/pratinjau', { template_version_id: versionId, ...f }), { onDone: (r) => setPreview(r.html) });
  const setField = (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, fields: { ...f.fields, [name]: e.target.value } });
  return (
    <form noValidate className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); if (validate()) onSubmit(f); }}>
      <Card><CardContent className="flex flex-col gap-5">
        <Field label="Perihal" required error={errs.perihal}>{(p) => <Input {...p} value={f.perihal} onChange={(e) => setF({ ...f, perihal: e.target.value })} />}</Field>
        <Field label="Ditujukan kepada" required error={errs.tujuan} hint="Contoh: Kepala Sekolah SDN 01.">{(p) => <Input {...p} value={f.tujuan} onChange={(e) => setF({ ...f, tujuan: e.target.value })} />}</Field>
        <Field label="Tanggal surat" required error={errs.tgl_surat}>{(p) => <Input {...p} type="date" value={f.tgl_surat} onChange={(e) => setF({ ...f, tgl_surat: e.target.value })} />}</Field>
        <Field label="Yang menandatangani" required hint="Surat baru bisa diajukan setelah penandatangan dipilih.">
          {(p) => (
            <NativeSelect {...p} value={f.penandatangan_id ?? ''} onChange={(e) => setF({ ...f, penandatangan_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Pilih penandatangan</option>
              {signers.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.jabatan ? `, ${u.jabatan}` : ''}</option>)}
            </NativeSelect>
          )}
        </Field>
        <p className="rounded-md bg-muted px-4 py-3">Nomor surat diberikan otomatis setelah pimpinan menyetujui.</p>
      </CardContent></Card>
      {own.length > 0 && (
        <Card><CardContent className="flex flex-col gap-5">
          <h2 className="text-xl">Isi surat</h2>
          {own.map((x) => (
            <Field key={x.name} label={x.label} required={x.required}>
              {(p) => (x.type === 'textarea'
                ? <Textarea {...p} rows={4} value={f.fields[x.name] || ''} onChange={setField(x.name)} />
                : <Input {...p} type={x.type === 'date' ? 'date' : 'text'} value={f.fields[x.name] || ''} onChange={setField(x.name)} />)}
            </Field>
          ))}
        </CardContent></Card>
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={pending}>{pending ? 'Sedang menyimpan…' : submitLabel}</Button>
        <Button type="button" variant="outline" disabled={prev.isPending} onClick={() => validate() && prev.mutate()}><EyeIcon aria-hidden /> {prev.isPending ? 'Sedang menyusun…' : 'Lihat Pratinjau Surat'}</Button>
        {cancel}
      </div>
      <Dialog open={preview != null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:w-[min(900px,calc(100vw-32px))]">
          <DialogHeader><DialogTitle>Pratinjau surat</DialogTitle><DialogDescription>Belum tersimpan. Nomor surat muncul setelah disetujui.</DialogDescription></DialogHeader>
          <DialogBody><div className="preview-doc rounded-md border border-border p-6 sm:p-10" dangerouslySetInnerHTML={{ __html: preview || '' }} /></DialogBody>
        </DialogContent>
      </Dialog>
    </form>
  );
}
