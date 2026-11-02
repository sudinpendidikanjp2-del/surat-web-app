'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { BrandMark, useBranding } from '@/components/app/branding';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) { setError('Isi nama pengguna dan kata sandi terlebih dahulu.'); return; }
    setBusy(true);
    try {
      await api.post('/auth/login', { username: username.trim(), password });
      const next = params.get('lanjut');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <main id="isi" className="grid min-h-dvh lg:grid-cols-2">
      {/* Panel identitas: tanpa foto stok (tidak ada foto pegawai asli); isinya hanya hal yang benar-benar dilakukan aplikasi. */}
      <section aria-label="Tentang aplikasi" className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <BrandMarkInverse />
        <div className="flex max-w-md flex-col gap-5">
          <span className="w-fit rounded-xl bg-accent px-4 py-2 text-2xl font-extrabold leading-tight text-accent-foreground">Surat masuk sampai surat keluar, di satu tempat.</span>
          <ul className="flex flex-col gap-2 text-sm opacity-90">
            <li>Catat surat dari foto atau PDF, nomor agenda otomatis.</li>
            <li>Disposisi, tugas, dan batas waktu yang terpantau.</li>
            <li>Surat keluar dari template, dengan pratinjau sebelum disimpan.</li>
            <li>Pengirim dapat melacak suratnya dengan kode unik.</li>
          </ul>
        </div>
        <p className="text-sm opacity-80">Mengirim surat ke kantor ini? <Link href="/lacak" className="font-semibold text-primary-foreground">Lacak surat Anda</Link></p>
      </section>
      <div className="flex items-start justify-center px-4 py-10 sm:items-center">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div className="lg:hidden"><BrandMark size="lg" /></div>
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-bold tracking-tight">Masuk</h1>
            <p className="text-muted-foreground">Gunakan akun yang diberikan admin kantor Anda.</p>
          </div>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {error && <Alert variant="late">{error}</Alert>}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Nama pengguna</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Kata sandi</Label>
              <Input id="password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm sm:min-h-9">
                <Checkbox checked={show} onCheckedChange={(v) => setShow(v === true)} /> Tampilkan kata sandi
              </label>
            </div>
            <Button type="submit" size="lg" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</Button>
            <p className="text-sm text-muted-foreground">Lupa kata sandi? Hubungi admin sistem di kantor Anda.</p>
          </form>
          <p className="text-sm lg:hidden">Mengirim surat ke kantor ini? <Link href="/lacak">Lacak surat Anda</Link></p>
        </div>
      </div>
    </main>
  );
}

function BrandMarkInverse() {
  const b = useBranding();
  return (
    <span className="flex items-center gap-3">
      {b.ikonUrl && <img src={b.ikonUrl} alt="" className="size-10 rounded-xl bg-white object-contain p-1" />}
      <span className="flex flex-col leading-tight"><span className="text-xl font-extrabold">{b.nama}</span>{b.tagline && <span className="text-sm opacity-80">{b.tagline}</span>}</span>
    </span>
  );
}
