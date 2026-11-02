'use client';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Steps } from '@/components/app/steps';
import { Loading } from '@/components/app/states';
import { tanggalIndo } from '@/domain/calendar';
import { formatTrackCode, normalizeTrackCode, type PublicTracking } from '@/domain/tracking';
import Link from 'next/link';
import { BrandMark } from '@/components/app/branding';
import { api } from '@/lib/api-client';

/** Pelacakan surat untuk pengirim: satu isian, satu tombol, lalu tahapan yang dilalui surat. */
export function TrackingPage({ initial }: { initial: string }) {
  const id = useId();
  const [text, setText] = useState(initial);
  const [code, setCode] = useState(() => normalizeTrackCode(initial));
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['lacak', code], enabled: Boolean(code), retry: false,
    queryFn: () => api.get<PublicTracking>(`/public/lacak/${code}`),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeTrackCode(text);
    if (!c) return setErr('Kode belum lengkap. Kode terdiri dari 20 huruf dan angka, seperti tertulis pada tanda terima.');
    setErr(null);
    setCode(c);
    window.history.replaceState(null, '', `/lacak/${c}`);
  };
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <BrandMark />
          <Link href="/masuk" className="text-sm font-medium">Masuk pegawai</Link>
        </div>
      </header>
      <main id="isi" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
        <section className="flex flex-col gap-5 rounded-3xl bg-primary p-6 text-primary-foreground sm:p-8">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">Lacak surat Anda</h1>
            <p className="opacity-90">Masukkan kode lacak dari tanda terima, atau pindai kode QR-nya. Tidak perlu akun.</p>
          </div>
          <form className="flex flex-col gap-2" onSubmit={submit} noValidate>
            <label htmlFor={id} className="text-sm font-semibold">Kode lacak</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Contoh: 7K3M-Q9TX-2HDP-WR4B-N8ZC" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={err ? true : undefined}
                className="h-12 rounded-full border-transparent font-mono tracking-wider text-foreground sm:h-12" />
              <Button type="submit" size="lg">Lacak</Button>
            </div>
            {err && <p className="rounded-xl bg-late-soft px-3 py-2 text-sm font-semibold text-late" role="alert">{err}</p>}
          </form>
        </section>
        {code && (q.isPending ? <Card><CardContent><Loading label="Mencari surat…" rows={3} /></CardContent></Card> : q.isError ? (
          <Alert variant="late">{q.error.message}. Periksa kembali kode pada tanda terima, atau hubungi kantor yang menerima surat Anda.</Alert>
        ) : (
          <div className="grid gap-6 sm:grid-cols-[1fr_1.2fr]">
            <Card><CardContent className="flex flex-col gap-4">
              <span className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">{q.data.selesai ? 'Selesai' : 'Dalam proses'}</span>
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">Posisi sekarang</p>
                <p className="text-2xl font-bold tracking-tight">{q.data.posisi}</p>
              </div>
              <dl className="flex flex-col gap-2 text-sm">
                <div><dt className="text-muted-foreground">Nomor surat</dt><dd className="font-semibold break-words">{q.data.no_surat}</dd></div>
                <div><dt className="text-muted-foreground">Diterima</dt><dd className="font-semibold">{tanggalIndo(q.data.tgl_diterima)}</dd></div>
                <div><dt className="text-muted-foreground">Terakhir diperbarui</dt><dd className="font-semibold">{tanggalIndo(q.data.diperbarui)}</dd></div>
                <div><dt className="text-muted-foreground">Kode</dt><dd className="font-mono font-semibold">{formatTrackCode(code)}</dd></div>
              </dl>
            </CardContent></Card>
            <Card><CardContent className="flex flex-col gap-4">
              <h2 className="text-base font-bold">Tahapan</h2>
              <Steps label="Tahapan surat" items={q.data.steps.map((s) => ({ ...s, tanggal: s.tanggal ? tanggalIndo(s.tanggal) : null }))} />
            </CardContent></Card>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">Halaman ini hanya menampilkan tahapan umum. Isi surat, nama pegawai, dan catatan internal tidak ditampilkan.</p>
      </main>
    </div>
  );
}
