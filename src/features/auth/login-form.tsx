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
    <main id="isi" className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="stamp w-fit">Sistem Surat</span>
          <h1 className="text-2xl">Masuk</h1>
          <p className="text-muted-foreground">Untuk mencatat, meneruskan, dan menindaklanjuti surat kantor.</p>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:p-6">
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
          <Button type="submit" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</Button>
          <p className="text-sm text-muted-foreground">Lupa kata sandi? Hubungi admin sistem di kantor Anda.</p>
        </form>
        <p className="text-sm">Mengirim surat ke kantor ini? <Link href="/lacak">Cek perkembangan surat Anda</Link></p>
      </div>
    </main>
  );
}
