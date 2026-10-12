'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/app/form-field';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { api } from '@/lib/api-client';

interface Settings {
  instansi?: { nama: string; alamat: string; kota: string; kode_unit: string };
  penomoran?: { format: string; kode_default: string; digits: number };
  sla?: Record<'Rendah' | 'Normal' | 'Tinggi' | 'Mendesak', number>;
}

export function SettingsPage() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Pengaturan Kantor" intro="Setiap bagian disimpan sendiri-sendiri dengan tombol Simpan di bawahnya." back={{ href: '/lainnya', label: 'Kembali ke Menu Lainnya' }} />
      <Async q={q} isEmpty={() => false}>
        {(s) => (
          <>
            <SettingForm k="instansi" title="Identitas kantor" intro="Tampil pada kop dan lembar disposisi." initial={s.instansi || { nama: '', alamat: '', kota: '', kode_unit: '' }}
              fields={[['nama', 'Nama kantor', true], ['alamat', 'Alamat', false, 'area'], ['kota', 'Kota', true], ['kode_unit', 'Kode kantor pada nomor surat', true]]} />
            <SettingForm k="penomoran" title="Nomor surat keluar" initial={s.penomoran || { format: '', kode_default: '', digits: 3 }}
              intro="Pola boleh memuat {kode}, {urut}, {unit}, {bulan_romawi}, {bulan}, dan {tahun}. {urut} wajib ada."
              fields={[['format', 'Pola nomor', true], ['kode_default', 'Kode klasifikasi bawaan', true], ['digits', 'Jumlah angka nomor urut', true, 'number']]} />
            <SettingForm k="sla" title="Batas waktu disposisi" intro="Jumlah hari kerja sejak surat diterima, menurut prioritas surat." initial={s.sla || { Rendah: 5, Normal: 5, Tinggi: 3, Mendesak: 1 }}
              fields={[['Mendesak', 'Mendesak (hari kerja)', true, 'number'], ['Tinggi', 'Tinggi (hari kerja)', true, 'number'], ['Normal', 'Normal (hari kerja)', true, 'number'], ['Rendah', 'Rendah (hari kerja)', true, 'number']]} />
          </>
        )}
      </Async>
    </Page>
  );
}

function SettingForm<T extends object>({ k, title, intro, initial, fields }: {
  k: string; title: string; intro?: string; initial: T; fields: [keyof T & string, string, boolean, ('area' | 'number')?][];
}) {
  const [v, setV] = useState<Record<string, string | number>>(initial as Record<string, string | number>);
  const save = useAction(() => api.put(`/settings/${k}`, v), { success: `${title} sudah disimpan.`, keys: ['settings'] });
  return (
    <Section title={title} intro={intro}>
      <Card><CardContent>
        <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          {fields.map(([name, label, required, kind]) => (
            <Field key={name} label={label} required={required}>
              {(p) => kind === 'area'
                ? <Textarea {...p} value={String(v[name] ?? '')} onChange={(e) => setV((s) => ({ ...s, [name]: e.target.value }))} />
                : <Input {...p} type={kind === 'number' ? 'number' : 'text'} inputMode={kind === 'number' ? 'numeric' : undefined} className={kind === 'number' ? 'max-w-40' : ''}
                    value={String(v[name] ?? '')} onChange={(e) => setV((s) => ({ ...s, [name]: kind === 'number' ? Number(e.target.value) : e.target.value }))} />}
            </Field>
          ))}
          <div><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Sedang menyimpan…' : `Simpan ${title}`}</Button></div>
        </form>
      </CardContent></Card>
    </Section>
  );
}
