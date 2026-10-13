'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';
import { Field } from './form-field';
import { Async, Empty } from './states';
import { useAction } from './use-action';

interface Entry { id: number; tipe: string; teks: string; created_at: string; user_nama: string | null }

const mention = (t: string) => t.split(/(@[a-z0-9._-]+)/gi).map((p, i) => (p.startsWith('@') ? <strong key={i}>{p}</strong> : p));

/** Catatan dan riwayat satu surat. Terbaru di atas. Riwayat tidak dapat diubah atau dihapus. */
export function Discussion({ base, queryKey, canWrite }: { base: string; queryKey: unknown[]; canWrite: boolean }) {
  const q = useQuery({ queryKey: ['timeline', ...queryKey], queryFn: () => api.get<Entry[]>(`${base}/timeline`) });
  const [teks, setTeks] = useState('');
  const act = useAction(() => api.post(`${base}/komentar`, { teks }), { success: 'Catatan sudah disimpan.', keys: ['timeline'], onDone: () => setTeks('') });
  return (
    <div className="flex flex-col gap-5">
      {canWrite && (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (teks.trim()) act.mutate(); }}>
          <Field label="Tulis catatan" hint="Ketik @ lalu nama pengguna untuk memberi tahu rekan, misalnya @andi.">
            {(p) => <Textarea {...p} rows={3} value={teks} onChange={(e) => setTeks(e.target.value)} />}
          </Field>
          <div><Button type="submit" disabled={act.isPending || !teks.trim()}>{act.isPending ? 'Menyimpan…' : 'Simpan catatan'}</Button></div>
        </form>
      )}
      <Async q={q} empty={<Empty title="Belum ada riwayat" />}>
        {(rows) => (
          <ol className="flex flex-col gap-0" aria-label="Riwayat">
            {[...rows].reverse().map((e) => (
              <li key={e.id} className="flex flex-col gap-1 border-t border-line py-3 text-sm first:border-t-0 first:pt-0">
                <span className="text-muted-foreground">{fmtDateTime(e.created_at)}{e.user_nama ? `, oleh ${e.user_nama}` : ''}</span>
                {e.tipe === 'komentar'
                  ? <p className="whitespace-pre-wrap break-words rounded-md bg-muted px-3 py-2"><span className="font-bold">Catatan: </span>{mention(e.teks)}</p>
                  : <p className="break-words">{e.teks}</p>}
              </li>
            ))}
          </ol>
        )}
      </Async>
    </div>
  );
}
