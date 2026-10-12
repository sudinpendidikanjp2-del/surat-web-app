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
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="stamp w-fit">SISTEM SURAT</span>
          <h1 className="text-3xl">Masuk ke Sistem Surat</h1>
          <p className="text-lg text-muted-foreground">Untuk mencatat, meneruskan, dan menindaklanjuti surat kantor.</p>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-5 rounded-lg border-2 border-[#d6d1c4] bg-card p-5 sm:p-7">
          {error && <Alert variant="late">{error}</Alert>}
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Nama pengguna</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Kata sandi</Label>
            <Input id="password" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
              <Checkbox checked={show} onCheckedChange={(v) => setShow(v === true)} /> Tampilkan kata sandi
            </label>
          </div>
          <Button type="submit" size="lg" disabled={busy}>{busy ? 'Sedang memeriksa…' : 'Masuk'}</Button>
          <p className="text-muted-foreground">Lupa kata sandi? Hubungi admin sistem di kantor Anda.</p>
        </form>
        <p>Anda mengirim surat ke kantor ini? <Link href="/lacak">Cek perkembangan surat Anda</Link></p>
      </div>
    </main>
  );
}
