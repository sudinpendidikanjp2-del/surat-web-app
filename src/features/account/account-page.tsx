'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/app/form-field';
import { Page, PageHeader, Section } from '@/components/app/page';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import { api } from '@/lib/api-client';

/** Data diri (baca saja) dan ganti kata sandi. */
export function AccountPage() {
  const user = useUser();
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = useAction(() => api.post('/auth/password', { lama, baru }), {
    success: 'Kata sandi sudah diganti. Perangkat lain yang memakai akun ini sudah dikeluarkan.',
    onDone: () => { setLama(''); setBaru(''); setUlang(''); },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lama) return setErr('Isi kata sandi Anda yang sekarang.');
    if (baru.length < 8) return setErr('Kata sandi baru minimal 8 huruf atau angka.');
    if (baru !== ulang) return setErr('Kata sandi baru dan ulangannya tidak sama.');
    setErr(null);
    save.mutate();
  };
  const rows: [string, string | null][] = [['Nama', user.nama], ['Nama pengguna', user.username], ['Peran', user.roleLabel], ['Jabatan', user.jabatan], ['Unit kerja', user.unitNama], ['NIP', user.nip]];
  return (
    <Page className="max-w-3xl">
      <PageHeader title="Akun Saya" back={{ href: '/lainnya', label: 'Kembali ke Menu Lainnya' }} />
      <Section title="Data diri" intro="Bila ada yang salah, minta admin sistem untuk mengubahnya.">
        <Card><CardContent>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
            {rows.map(([k, v]) => <div key={k} className="contents"><dt className="font-bold">{k}</dt><dd className="break-words">{v || '-'}</dd></div>)}
          </dl>
        </CardContent></Card>
      </Section>
      <Section title="Ganti kata sandi" intro="Pakai minimal 8 huruf atau angka yang mudah Anda ingat tetapi sulit ditebak orang lain.">
        <Card><CardContent>
          <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
            {err && <Alert variant="late">{err}</Alert>}
            <Field label="Kata sandi sekarang" required>{(p) => <Input {...p} type={show ? 'text' : 'password'} autoComplete="current-password" value={lama} onChange={(e) => setLama(e.target.value)} />}</Field>
            <Field label="Kata sandi baru" required>{(p) => <Input {...p} type={show ? 'text' : 'password'} autoComplete="new-password" value={baru} onChange={(e) => setBaru(e.target.value)} />}</Field>
            <Field label="Ulangi kata sandi baru" required>{(p) => <Input {...p} type={show ? 'text' : 'password'} autoComplete="new-password" value={ulang} onChange={(e) => setUlang(e.target.value)} />}</Field>
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3"><Checkbox checked={show} onCheckedChange={(v) => setShow(v === true)} /> Tampilkan kata sandi</label>
            <div><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Sedang menyimpan…' : 'Simpan Kata Sandi Baru'}</Button></div>
          </form>
        </CardContent></Card>
      </Section>
    </Page>
  );
}
