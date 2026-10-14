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
import { useRouter } from 'next/navigation';
import { ImageIcon } from 'lucide-react';
import { useBranding } from '@/components/app/branding';
import { FilePicker } from '@/components/app/file-picker';
import { FilterButtons } from '@/components/app/list-controls';
import { useListState } from '@/components/app/use-list-state';
import { withBrandingDefaults, type Branding } from '@/domain/branding';
import { api } from '@/lib/api-client';

interface Settings {
  instansi?: { nama: string; alamat: string; kota: string; kode_unit: string };
  penomoran?: { format: string; kode_default: string; digits: number };
  sla?: Record<'Rendah' | 'Normal' | 'Tinggi' | 'Mendesak', number>;
  tampilan?: Partial<Branding>;
}
type Tab = 'tampilan' | 'kantor' | 'nomor' | 'batas';

export function SettingsPage() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api.get<Settings>('/settings') });
  const { view, set } = useListState<Tab>('tampilan');
  return (
    <Page className="max-w-4xl">
      <PageHeader title="Pengaturan" intro="Setiap bagian disimpan sendiri dengan tombol Simpan di bawahnya." />
      <FilterButtons label="Bagian pengaturan" value={view} onChange={(v) => set({ tampil: v })}
        options={[{ value: 'tampilan', label: 'Tampilan aplikasi' }, { value: 'kantor', label: 'Identitas kantor' }, { value: 'nomor', label: 'Nomor surat' }, { value: 'batas', label: 'Batas waktu' }]} />
      <Async q={q} isEmpty={() => false}>
        {(s) => (
          <>
            {view === 'tampilan' && <BrandingForm initial={withBrandingDefaults(s.tampilan as Branding)} />}
            {view === 'kantor' && <SettingForm k="instansi" title="Identitas kantor" intro="Tampil pada kop, tanda terima, dan lembar disposisi." initial={s.instansi || { nama: '', alamat: '', kota: '', kode_unit: '' }}
              fields={[['nama', 'Nama kantor', true], ['alamat', 'Alamat', false, 'area'], ['kota', 'Kota', true], ['kode_unit', 'Kode kantor pada nomor surat', true]]} />}
            {view === 'nomor' && <SettingForm k="penomoran" title="Nomor surat keluar" initial={s.penomoran || { format: '', kode_default: '', digits: 3 }}
              intro="Pola boleh memuat {kode}, {urut}, {unit}, {bulan_romawi}, {bulan}, dan {tahun}. {urut} wajib ada."
              fields={[['format', 'Pola nomor', true], ['kode_default', 'Kode klasifikasi bawaan', true], ['digits', 'Jumlah angka nomor urut', true, 'number']]} />}
            {view === 'batas' && <SettingForm k="sla" title="Batas waktu disposisi" intro="Jumlah hari kerja sejak surat diterima, menurut prioritas surat." initial={s.sla || { Rendah: 5, Normal: 5, Tinggi: 3, Mendesak: 1 }}
              fields={[['Mendesak', 'Mendesak (hari kerja)', true, 'number'], ['Tinggi', 'Tinggi (hari kerja)', true, 'number'], ['Normal', 'Normal (hari kerja)', true, 'number'], ['Rendah', 'Rendah (hari kerja)', true, 'number']]} />}
          </>
        )}
      </Async>
    </Page>
  );
}

/**
 * Identitas aplikasi: nama dan keterangan di menu samping, judul tab peramban, deskripsi untuk mesin pencari,
 * dan ikon (favicon). Perubahan berlaku setelah halaman dimuat ulang.
 */
function BrandingForm({ initial }: { initial: Branding }) {
  const router = useRouter();
  const b = useBranding();
  const [v, setV] = useState({ nama: initial.nama, tagline: initial.tagline, judul_tab: initial.judul_tab, deskripsi: initial.deskripsi });
  const [files, setFiles] = useState<File[]>([]);
  const done = () => router.refresh();
  const save = useAction(() => api.put('/settings/tampilan', v), { success: 'Tampilan aplikasi disimpan.', keys: ['settings'], onDone: done });
  const upload = useAction(() => api.upload('/branding/ikon', {}, { file: files[0] }), { success: 'Ikon diganti.', keys: ['settings'], onDone: () => { setFiles([]); done(); } });
  const remove = useAction(() => api.del('/branding/ikon'), { success: 'Ikon dihapus. Nama aplikasi tampil sebagai teks.', keys: ['settings'], onDone: done });
  const put = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Section title="Nama dan keterangan">
        <Card><CardContent>
          <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <Field label="Nama aplikasi" required hint="Tampil di menu samping dan halaman masuk.">{(p) => <Input {...p} maxLength={60} value={v.nama} onChange={put('nama')} />}</Field>
            <Field label="Keterangan singkat" hint="Satu baris di bawah nama aplikasi.">{(p) => <Input {...p} maxLength={80} value={v.tagline} onChange={put('tagline')} />}</Field>
            <Field label="Judul di tab peramban" required hint="Contoh hasil: Surat Masuk | Judul ini">{(p) => <Input {...p} maxLength={70} value={v.judul_tab} onChange={put('judul_tab')} />}</Field>
            <Field label="Deskripsi halaman" hint="Dibaca mesin pencari dan saat tautan dibagikan. Maks 200 huruf.">{(p) => <Textarea {...p} rows={3} maxLength={200} value={v.deskripsi} onChange={put('deskripsi')} />}</Field>
            <div><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Menyimpan…' : 'Simpan tampilan'}</Button></div>
          </form>
        </CardContent></Card>
      </Section>
      <Section title="Ikon aplikasi">
        <Card><CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
            {b.ikonUrl ? <img src={b.ikonUrl} alt="Ikon saat ini" className="size-12 rounded-xl bg-card object-contain" /> : <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-strong text-muted-foreground"><ImageIcon className="size-5" aria-hidden /><span className="sr-only">Belum ada ikon</span></span>}
            <span className="text-sm text-muted-foreground">{b.ikonUrl ? 'Ikon ini tampil di tab peramban dan menu samping.' : 'Tanpa ikon, nama aplikasi ditulis sebagai teks.'}</span>
          </div>
          <FilePicker files={files} onChange={setFiles} multiple={false} accept=".png,.jpg,.jpeg" label="Pilih ikon" hint="PNG atau JPG persegi, misalnya 512 x 512 piksel, maks 512 KB." />
          <div className="flex flex-wrap gap-2">
            <Button disabled={!files[0] || upload.isPending} onClick={() => upload.mutate()}>{upload.isPending ? 'Mengunggah…' : 'Pakai ikon ini'}</Button>
            {b.ikonUrl && <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>Hapus ikon</Button>}
          </div>
        </CardContent></Card>
      </Section>
    </div>
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
