'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChoiceRow, Choices, Field } from '@/components/app/form-field';
import { FilePicker } from '@/components/app/file-picker';
import { SIFAT } from '@/domain/letter-in';
import { REF_KATEGORI } from '@/domain/reference';
import { useInstansiOptions, useRefValues } from '@/features/reference/api';
import { useUserOptions } from '@/features/letters-in/api';
import { api } from '@/lib/api-client';

export type NomorMode = 'manual' | 'otomatis' | 'nanti' | 'tetap';
export interface RecordValues {
  nomor_mode: NomorMode; nomor_surat: string; kode_klasifikasi: string; tgl_surat: string; jenis: string; sifat: string;
  perihal: string; tujuan: string; lampiran: string; penandatangan_id: string; catatan: string;
}

const withCurrent = (list: string[], v: string) => (v && !list.includes(v) ? [v, ...list] : list);

/**
 * Formulir pencatatan surat keluar (seperti surat masuk): data dari surat yang sudah ditandatangani, bukan isinya.
 * `withFiles`: tampilkan pilihan pindaian surat bertanda tangan (saat mencatat; saat mengubah, unggah dari halaman surat).
 */
export function RecordForm({ initial, existingNomor, withFiles, pending, submitLabel, onSubmit, cancel }: {
  initial: RecordValues; existingNomor?: string | null; withFiles: boolean; pending: boolean; submitLabel: string;
  onSubmit: (v: RecordValues, files: File[]) => void; cancel?: React.ReactNode;
}) {
  const [f, setF] = useState(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const jenisList = useRefValues('jenis_surat', REF_KATEGORI.jenis_surat.defaults);
  const sifatList = useRefValues('sifat', SIFAT);
  const instansi = useInstansiOptions().data || [];
  const users = useUserOptions();
  const signers = useMemo(() => (users.data || []).filter((u) => ['pimpinan', 'pejabat', 'superadmin'].includes(u.role)), [users.data]);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ penomoran?: { format: string; kode_default: string } }>('/settings'), staleTime: 300_000 });
  const pola = settings.data?.penomoran;
  const set = (k: keyof RecordValues) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.perihal.trim()) e.perihal = 'Perihal wajib diisi.';
    if (!f.tujuan.trim()) e.tujuan = 'Tujuan surat wajib diisi.';
    if (!f.tgl_surat) e.tgl_surat = 'Tanggal surat wajib diisi.';
    if (f.nomor_mode === 'manual' && !f.nomor_surat.trim()) e.nomor_surat = 'Tulis nomor surat seperti yang tertera di surat.';
    setErrs(e);
    if (Object.keys(e).length) toast.error('Ada isian yang perlu dilengkapi. Lihat tulisan merah.');
    return Object.keys(e).length === 0;
  };
  const modes: { value: NomorMode; label: string; hint: string }[] = [
    ...(existingNomor ? [{ value: 'tetap' as NomorMode, label: `Tetap ${existingNomor}`, hint: 'Nomor tidak diubah.' }] : []),
    { value: 'manual', label: 'Sudah ada nomor', hint: 'Ketik nomor yang tertulis di surat.' },
    { value: 'otomatis', label: 'Ambil nomor urut berikutnya', hint: pola ? `Pola: ${pola.format}` : 'Sesuai pola di Pengaturan > Nomor surat.' },
    ...(existingNomor ? [] : [{ value: 'nanti' as NomorMode, label: 'Nanti', hint: 'Surat belum dapat dikirim sebelum bernomor.' }]),
  ];
  return (
    <form noValidate className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); if (validate()) onSubmit(f, files); }}>
      <Card><CardContent className="grid gap-4 sm:grid-cols-2">
        <Choices className="sm:col-span-2" legend="Nomor surat">
          <RadioGroup value={f.nomor_mode} onValueChange={(v) => setF((s) => ({ ...s, nomor_mode: v as NomorMode }))} className="grid gap-2 sm:grid-cols-2">
            {modes.map((m) => (
              <ChoiceRow key={m.value}><RadioGroupItem value={m.value} /><span className="flex min-w-0 flex-col"><span className="font-semibold">{m.label}</span><span className="text-muted-foreground [overflow-wrap:anywhere]">{m.hint}</span></span></ChoiceRow>
            ))}
          </RadioGroup>
        </Choices>
        {f.nomor_mode === 'manual' && <Field className="sm:col-span-2" label="Nomor surat" required error={errs.nomor_surat}>{(p) => <Input {...p} value={f.nomor_surat} onChange={set('nomor_surat')} />}</Field>}
        {f.nomor_mode === 'otomatis' && <Field className="sm:col-span-2" label="Kode klasifikasi" hint={`Mengisi {kode} pada pola. Kosong: ${pola?.kode_default || 'kode bawaan kantor'}.`}>{(p) => <Input {...p} value={f.kode_klasifikasi} onChange={set('kode_klasifikasi')} />}</Field>}
        <Field className="sm:col-span-2" label="Perihal" required error={errs.perihal}>{(p) => <Textarea {...p} rows={2} value={f.perihal} onChange={set('perihal')} />}</Field>
        <Field className="sm:col-span-2" label="Ditujukan kepada" required error={errs.tujuan} hint="Ketik untuk memilih dari daftar instansi, atau tulis yang lain.">{(p) => <>
          <Input {...p} list="instansi-tujuan" value={f.tujuan} onChange={set('tujuan')} autoComplete="off" />
          <datalist id="instansi-tujuan">{instansi.map((x) => <option key={x.id} value={x.nama}>{x.singkatan || ''}</option>)}</datalist>
        </>}</Field>
        <Field label="Tanggal surat" required error={errs.tgl_surat}>{(p) => <Input {...p} type="date" value={f.tgl_surat} onChange={set('tgl_surat')} />}</Field>
        <Field label="Jenis surat" required>{(p) => <NativeSelect {...p} value={f.jenis} onChange={set('jenis')}>{withCurrent(jenisList, f.jenis).map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
        <Field label="Sifat surat" required>{(p) => <NativeSelect {...p} value={f.sifat} onChange={set('sifat')}>{withCurrent(sifatList, f.sifat).map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
        <Field label="Lampiran" hint="Contoh: 1 berkas.">{(p) => <Input {...p} value={f.lampiran} onChange={set('lampiran')} />}</Field>
        <Field className="sm:col-span-2" label="Ditandatangani oleh">
          {(p) => (
            <NativeSelect {...p} value={f.penandatangan_id} onChange={set('penandatangan_id')}>
              <option value="">Tidak dicatat</option>
              {signers.map((u) => <option key={u.id} value={u.id}>{u.nama}{u.jabatan ? `, ${u.jabatan}` : ''}</option>)}
            </NativeSelect>
          )}
        </Field>
        <Field className="sm:col-span-2" label="Catatan">{(p) => <Input {...p} value={f.catatan} onChange={set('catatan')} />}</Field>
      </CardContent></Card>
      {withFiles && (
        <Card><CardContent className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Pindaian surat yang sudah ditandatangani</h2>
          <FilePicker files={files} onChange={setFiles} accept=".pdf,.png,.jpg,.jpeg" label="Pilih file surat" hint="PDF atau foto. Boleh menyusul, tetapi wajib ada sebelum pengiriman dicatat." />
        </CardContent></Card>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {cancel}
        <Button type="submit" disabled={pending}>{pending ? 'Menyimpan…' : submitLabel}</Button>
      </div>
    </form>
  );
}

/** Isian formulir sebagai badan permintaan API. */
export const recordBody = (v: RecordValues) => ({ ...v, penandatangan_id: v.penandatangan_id ? Number(v.penandatangan_id) : null });
