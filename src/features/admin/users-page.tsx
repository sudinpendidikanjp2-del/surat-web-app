'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect } from '@/components/ui/input';
import { ActionDialog } from '@/components/app/action-dialog';
import { Field } from '@/components/app/form-field';
import { FilterButtons, Pager, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { ROLE_LABEL, ROLES, type Role } from '@/domain/roles';
import { useUnits } from '@/features/letters-in/api';
import { api, qs } from '@/lib/api-client';

interface UserRow { id: number; username: string; nama: string; nip: string | null; pangkat: string | null; jabatan: string | null; email: string | null; role: Role; unit_id: number | null; unit_nama: string | null; aktif: boolean }
interface UserPage { items: UserRow[]; total: number; page: number; pageSize: number }
type View = 'aktif' | 'nonaktif' | 'semua';

const ROLE_DESC: Record<Role, string> = {
  superadmin: 'Mengatur seluruh aplikasi.',
  tu: 'Mencatat surat masuk dan meneruskannya.',
  pimpinan: 'Memberi disposisi dan menyetujui surat keluar.',
  pejabat: 'Menerima disposisi dan membagi tugas.',
  pelaksana: 'Mengerjakan tugas dan menyusun konsep surat.',
  viewer: 'Hanya melihat, tidak mengubah.',
};

const KEYS = ['users', 'user-options'];

export function UsersPage() {
  const { view, q, page, set } = useListState<View>('aktif');
  const [edit, setEdit] = useState<UserRow | 'baru' | null>(null);
  const list = useQuery({
    queryKey: ['users', view, q, page],
    queryFn: () => api.get<UserPage>(`/users${qs({ q, page, pageSize: 20, aktif: view === 'aktif' ? '1' : view === 'nonaktif' ? '0' : '' })}`),
  });
  return (
    <Page>
      <PageHeader title="Pengguna" intro="Orang yang dapat masuk ke aplikasi ini, beserta perannya." back={{ href: '/lainnya', label: 'Kembali ke Menu Lainnya' }}>
        <Button onClick={() => setEdit('baru')}><PlusIcon aria-hidden /> Tambah Pengguna</Button>
      </PageHeader>
      <div className="flex flex-col gap-5">
        <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari nama, NIP, atau nama pengguna" />
        <FilterButtons label="Tampilkan" value={view} onChange={(v) => set({ tampil: v })} options={[{ value: 'aktif', label: 'Yang aktif' }, { value: 'nonaktif', label: 'Yang dinonaktifkan' }, { value: 'semua', label: 'Semua' }]} />
      </div>
      <Async q={list} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Tidak ada pengguna yang cocok" />}>
        {(d) => (
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col gap-3">
              {d.items.map((u) => (
                <li key={u.id}><Card><CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 text-xl font-bold">{u.nama}{!u.aktif && <Badge tone="late">Dinonaktifkan</Badge>}</p>
                    <p>{ROLE_LABEL[u.role]}{u.jabatan ? `, ${u.jabatan}` : ''}{u.unit_nama ? `, ${u.unit_nama}` : ''}</p>
                    <p className="text-muted-foreground break-all">Nama pengguna: {u.username}</p>
                  </div>
                  <Button variant="outline" onClick={() => setEdit(u)}>Ubah Data {u.nama.split(' ')[0]}</Button>
                </CardContent></Card></li>
              ))}
            </ul>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set({ halaman: p })} />
          </div>
        )}
      </Async>
      {edit && <UserDialog user={edit === 'baru' ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  );
}

function UserDialog({ user, onClose }: { user: UserRow | null; onClose: () => void }) {
  const me = useUser();
  const units = useUnits();
  const [v, setV] = useState({
    nama: user?.nama || '', username: user?.username || '', nip: user?.nip || '', pangkat: user?.pangkat || '', jabatan: user?.jabatan || '',
    email: user?.email || '', role: (user?.role || 'pelaksana') as Role, unit_id: user?.unit_id ? String(user.unit_id) : '', aktif: user?.aktif ?? true, password: '',
  });
  const [err, setErr] = useState<string | null>(null);
  const self = user?.id === me.id;
  const save = useAction(
    () => {
      const body = { ...v, unit_id: v.unit_id ? Number(v.unit_id) : null, password: v.password || undefined };
      return user ? api.put(`/users/${user.id}`, body) : api.post('/users', body);
    },
    { success: user ? 'Data pengguna sudah disimpan.' : 'Pengguna baru sudah ditambahkan. Beri tahu nama pengguna dan kata sandi awalnya.', keys: KEYS, onDone: onClose },
  );
  const put = <K extends keyof typeof v>(k: K) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const confirm = () => {
    if (!v.nama.trim()) return setErr('Nama wajib diisi.');
    if (!user && !v.username.trim()) return setErr('Nama pengguna wajib diisi.');
    if (!user && v.password.length < 8) return setErr('Kata sandi awal minimal 8 huruf atau angka.');
    if (user && v.password && v.password.length < 8) return setErr('Kata sandi baru minimal 8 huruf atau angka.');
    setErr(null);
    save.mutate();
  };
  return (
    <ActionDialog open onOpenChange={(o) => !o && onClose()} title={user ? `Ubah data ${user.nama}` : 'Tambah pengguna baru'}
      error={err || save.error?.message} confirmLabel={user ? 'Simpan Perubahan' : 'Tambah Pengguna'} pending={save.isPending} onConfirm={confirm}>
      <div className="flex flex-col gap-5">
        <Field label="Nama lengkap" required>{(p) => <Input {...p} value={v.nama} onChange={put('nama')} />}</Field>
        {!user && <Field label="Nama pengguna" required hint="Dipakai untuk masuk. Huruf kecil tanpa spasi, misalnya budi.santoso.">{(p) => <Input {...p} value={v.username} autoCapitalize="none" onChange={put('username')} />}</Field>}
        <Field label="Peran" required hint={ROLE_DESC[v.role]}>
          {(p) => <NativeSelect {...p} value={v.role} disabled={self} onChange={put('role') as never}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</NativeSelect>}
        </Field>
        <Field label="Unit kerja">
          {(p) => <NativeSelect {...p} value={v.unit_id} onChange={put('unit_id') as never}><option value="">Tanpa unit</option>{units.data?.filter((u) => u.aktif).map((u) => <option key={u.id} value={u.id}>{u.nama}</option>)}</NativeSelect>}
        </Field>
        <Field label="Jabatan">{(p) => <Input {...p} value={v.jabatan} onChange={put('jabatan')} />}</Field>
        <Field label="NIP">{(p) => <Input {...p} inputMode="numeric" value={v.nip} onChange={put('nip')} />}</Field>
        <Field label="Pangkat atau golongan">{(p) => <Input {...p} value={v.pangkat} onChange={put('pangkat')} />}</Field>
        <Field label="Email">{(p) => <Input {...p} type="email" value={v.email} onChange={put('email')} />}</Field>
        <Field label={user ? 'Kata sandi baru' : 'Kata sandi awal'} required={!user} hint={user ? 'Isi hanya bila pengguna lupa kata sandinya. Ia akan dikeluarkan dari semua perangkat.' : 'Minimal 8 huruf atau angka. Minta pengguna menggantinya setelah masuk pertama kali.'}>
          {(p) => <Input {...p} type="text" autoComplete="new-password" value={v.password} onChange={put('password')} />}
        </Field>
        {user && !self && (
          <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-md border-2 border-[#d6d1c4] px-4">
            <Checkbox checked={v.aktif} onCheckedChange={(c) => setV((s) => ({ ...s, aktif: c === true }))} />
            Akun aktif (hilangkan centang untuk melarang orang ini masuk)
          </label>
        )}
        {self && <p className="text-muted-foreground">Ini akun Anda sendiri, jadi peran dan status aktifnya tidak dapat diubah di sini.</p>}
      </div>
    </ActionDialog>
  );
}
