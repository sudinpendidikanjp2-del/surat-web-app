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
    <main id="isi" className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl">Lacak Surat</h1>
        <p className="text-lg text-muted-foreground">Masukkan kode pelacakan dari tanda terima surat Anda untuk melihat sampai mana surat diproses.</p>
      </header>
      <form className="flex flex-col gap-3" onSubmit={submit} noValidate>
        <label htmlFor={id} className="font-bold">Kode pelacakan</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id={id} value={text} onChange={(e) => setText(e.target.value)} placeholder="Contoh: 7K3M-Q9TX-2HDP-WR4B-N8ZC" autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={err ? true : undefined} />
          <Button type="submit">Lacak</Button>
        </div>
        {err && <p className="font-bold text-late" role="alert">{err}</p>}
      </form>
      {code && (q.isPending ? <Loading label="Sedang mencari surat…" rows={2} /> : q.isError ? (
        <Alert variant="late">{q.error.message}. Periksa kembali kode pada tanda terima, atau hubungi kantor yang menerima surat Anda.</Alert>
      ) : (
        <Card><CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <p className="text-muted-foreground">Kode {formatTrackCode(code)}</p>
            <p className="text-2xl font-bold">{q.data.posisi}</p>
            <p>Surat nomor <strong>{q.data.no_surat}</strong>, diterima {tanggalIndo(q.data.tgl_diterima)}.</p>
            <p className="text-muted-foreground">Terakhir diperbarui {tanggalIndo(q.data.diperbarui)}.</p>
          </div>
          <Steps label="Tahapan surat" items={q.data.steps.map((s) => ({ ...s, tanggal: s.tanggal ? tanggalIndo(s.tanggal) : null }))} />
        </CardContent></Card>
      ))}
    </main>
  );
}
