'use client';
import { useDeferredValue, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DownloadIcon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/app/form-field';
import { ErrorState, Loading } from '@/components/app/states';
import type { TemplateField } from '@/domain/letter-out';
import { api, downloadPost } from '@/lib/api-client';
import type { UserOption } from '@/features/letters-in/api';

export interface LetterValues { perihal: string; tujuan: string; tgl_surat: string; penandatangan_id: number | null; fields: Record<string, string> }

/** Tunda nilai sampai pengguna berhenti mengetik sebentar, agar pratinjau tidak dibuat ulang di setiap ketukan. */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/**
 * Formulir surat dari template DOCX, dengan pratinjau berdampingan yang diperbarui otomatis saat mengetik.
 * Hasil dapat diunduh (Word atau PDF) sebelum surat disimpan. Nomor surat diberikan setelah pimpinan menyetujui.
 */
export function LetterForm({ fields, versionId, initial, signers, onSubmit, pending, submitLabel, cancel }: {
  fields: TemplateField[]; versionId: number; initial: LetterValues; signers: UserOption[];
  onSubmit: (v: LetterValues) => void; pending: boolean; submitLabel: string; cancel?: React.ReactNode;
}) {
  const [f, setF] = useState(initial);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [dl, setDl] = useState<'' | 'docx' | 'pdf'>('');
  const own = fields.filter((x) => !x.sistem && !x.bawaan);
  const body = { template_version_id: versionId, ...f };
  const debounced = useDebounced(JSON.stringify(body), 700);
  const preview = useQuery({
    queryKey: ['draft-preview', debounced],
    queryFn: () => api.post<{ html: string }>('/letters-out/pratinjau', JSON.parse(debounced)),
    placeholderData: (p) => p,
  });
  const html = useDeferredValue(preview.data?.html);
  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.perihal.trim()) e.perihal = 'Perihal wajib diisi.';
    if (!f.tujuan.trim()) e.tujuan = 'Tujuan surat wajib diisi.';
    if (!f.tgl_surat) e.tgl_surat = 'Tanggal surat wajib diisi.';
    for (const x of own) if (x.required && !String(f.fields[x.name] || '').trim()) e[`f_${x.name}`] = `${x.label} wajib diisi.`;
    setErrs(e);
    if (Object.keys(e).length) toast.error('Ada isian yang perlu dilengkapi. Lihat tulisan merah.');
    return Object.keys(e).length === 0;
  };
  const download = async (format: 'docx' | 'pdf') => {
    setDl(format);
    try { await downloadPost(`/letters-out/pratinjau?format=${format}`, body); } catch (e) { toast.error((e as Error).message); } finally { setDl(''); }
  };
  const setField = (name: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, fields: { ...f.fields, [name]: e.target.value } });
  return (
    <form noValidate className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" onSubmit={(e) => { e.preventDefault(); if (validate()) onSubmit(f); }}>
      <div className="flex min-w-0 flex-col gap-6">
        <Card><CardContent className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="Perihal" required error={errs.perihal}>{(p) => <Input {...p} value={f.perihal} onChange={(e) => setF({ ...f, perihal: e.target.value })} />}</Field>
          <Field className="sm:col-span-2" label="Ditujukan kepada" required error={errs.tujuan} hint="Contoh: Kepala Sekolah SDN 01.">{(p) => <Input {...p} value={f.tujuan} onChange={(e) => setF({ ...f, tujuan: e.target.value })} />}</Field>
          <Field label="Tanggal surat" required error={errs.tgl_surat}>{(p) => <Input {...p} type="date" value={f.tgl_surat} onChange={(e) => setF({ ...f, tgl_surat: e.target.value })} />}</Field>
          <Field label="Penandatangan" required>
            {(p) => (
              <NativeSelect {...p} value={f.penandatangan_id ?? ''} onChange={(e) => setF({ ...f, penandatangan_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Pilih penandatangan</option>
                {signers.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.jabatan ? `, ${u.jabatan}` : ''}</option>)}
              </NativeSelect>
            )}
          </Field>
          <p className="rounded-xl bg-muted px-4 py-3 text-sm sm:col-span-2">Nomor surat diberikan otomatis setelah pimpinan menyetujui.</p>
        </CardContent></Card>
        {own.length > 0 && (
          <Card><CardContent className="flex flex-col gap-4">
            <h2 className="text-base font-bold">Isian template</h2>
            {own.map((x) => (
              <Field key={x.name} label={x.label} required={x.required} error={errs[`f_${x.name}`]}>
                {(p) => (x.type === 'textarea'
                  ? <Textarea {...p} rows={4} value={f.fields[x.name] || ''} onChange={setField(x.name)} />
                  : <Input {...p} type={x.type === 'date' ? 'date' : 'text'} value={f.fields[x.name] || ''} onChange={setField(x.name)} />)}
              </Field>
            ))}
          </CardContent></Card>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {cancel}
          <Button type="submit" disabled={pending}>{pending ? 'Menyimpan…' : submitLabel}</Button>
        </div>
      </div>

      <section aria-label="Pratinjau surat" className="flex min-w-0 flex-col gap-3 xl:sticky xl:top-20">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">Pratinjau</h2>
            <span className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
              {preview.isFetching ? <><RefreshCwIcon className="size-3 animate-spin" aria-hidden /> Memperbarui…</> : 'Diperbarui otomatis saat Anda mengetik'}
            </span>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" disabled={dl !== ''} onClick={() => download('docx')}><DownloadIcon aria-hidden /> {dl === 'docx' ? 'Menyiapkan…' : 'Word'}</Button>
            <Button type="button" size="sm" variant="outline" disabled={dl !== ''} onClick={() => download('pdf')}><DownloadIcon aria-hidden /> {dl === 'pdf' ? 'Menyiapkan…' : 'PDF'}</Button>
          </div>
        </div>
        <div className="max-h-[calc(100dvh-10rem)] overflow-auto rounded-2xl border border-border bg-muted p-3 sm:p-5">
          {preview.isError && !html ? <ErrorState error={preview.error} retry={() => preview.refetch()} /> : !html ? <div className="rounded-xl bg-card p-6"><Loading label="Menyusun pratinjau…" rows={6} /></div> : (
            <div className="preview-doc mx-auto max-w-[210mm] rounded-lg p-6 shadow-sm sm:p-10" dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </div>
      </section>
    </form>
  );
}
