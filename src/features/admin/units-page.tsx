'use client';
import { useState } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ActionDialog } from '@/components/app/action-dialog';
import { Field } from '@/components/app/form-field';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Stamp } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import { useUnits, type UnitOption } from '@/features/letters-in/api';
import { api } from '@/lib/api-client';

export function UnitsPage() {
  const units = useUnits();
  const [edit, setEdit] = useState<UnitOption | 'baru' | null>(null);
  return (
    <Page>
      <PageHeader title="Unit Kerja" intro="Bagian atau bidang di kantor. Disposisi dapat ditujukan ke unit, lalu diterima kepala unitnya.">
        <Button onClick={() => setEdit('baru')}><PlusIcon aria-hidden /> Tambah Unit</Button>
      </PageHeader>
      <Async q={units} empty={<Empty title="Belum ada unit kerja" />}>
        {(rows) => (
          <ul className="flex flex-col gap-3">
            {rows.map((u) => (
              <li key={u.id}><Card><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <p className="flex flex-wrap items-center gap-2 text-base font-bold">{u.nama}{!u.aktif && <Badge tone="late">Tidak dipakai</Badge>}</p>
                  <p className="flex flex-wrap items-center gap-2"><Stamp>{u.kode}</Stamp> {u.jumlah_pengguna} pengguna aktif</p>
                </div>
                <Button variant="outline" onClick={() => setEdit(u)}>Ubah {u.kode}</Button>
              </CardContent></Card></li>
            ))}
          </ul>
        )}
      </Async>
      {edit && <UnitDialog unit={edit === 'baru' ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function UnitDialog({ unit, onClose }: { unit: UnitOption | null; onClose: () => void }) {
  const [nama, setNama] = useState(unit?.nama || '');
  const [kode, setKode] = useState(unit?.kode || '');
  const [aktif, setAktif] = useState(unit?.aktif ?? true);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(() => (unit ? api.put(`/units/${unit.id}`, { nama, aktif }) : api.post('/units', { nama, kode })), {
    success: unit ? 'Unit kerja sudah disimpan.' : 'Unit kerja baru sudah ditambahkan.', keys: ['units', 'user-options'], onDone: onClose,
  });
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={unit ? `Ubah unit ${unit.nama}` : 'Tambah unit kerja'} error={err || save.error?.message}
      confirmLabel={unit ? 'Simpan Perubahan' : 'Tambah Unit'} pending={save.isPending}
      onConfirm={() => { if (!nama.trim() || (!unit && !kode.trim())) return setErr('Nama dan kode unit wajib diisi.'); setErr(null); save.mutate(); }}>
      <div className="flex flex-col gap-5">
        <Field label="Nama unit" required>{(p) => <Input {...p} value={nama} onChange={(e) => setNama(e.target.value)} />}</Field>
        {unit ? <p>Kode unit: <Stamp>{unit.kode}</Stamp> (tidak dapat diubah karena dipakai pada nomor surat)</p>
          : <Field label="Kode unit" required hint="Singkatan pendek, misalnya SAR untuk Sarana Prasarana.">{(p) => <Input {...p} value={kode} onChange={(e) => setKode(e.target.value.toUpperCase())} />}</Field>}
        {unit && (
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 text-sm">
            <Checkbox checked={aktif} onCheckedChange={(c) => setAktif(c === true)} /> Unit masih dipakai
          </label>
        )}
      </div>
    </ActionDialog>
  );
}
