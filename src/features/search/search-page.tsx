'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { FilterButtons, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Deadline, Stamp } from '@/components/app/status';
import { Badge } from '@/components/ui/badge';
import { useListState } from '@/components/app/use-list-state';
import type { SlaIndicator } from '@/domain/sla';
import { api, qs } from '@/lib/api-client';
import { fmtDate } from '@/lib/format';

interface Result { id: number; tipe: 'masuk' | 'keluar'; no_agenda: string; nomor: string | null; perihal: string; pihak: string; tanggal: string; statusLabel: string; sla?: SlaIndicator }
type View = 'semua' | 'masuk' | 'keluar';

/** Pencarian lintas surat masuk dan keluar: nomor, perihal, pengirim, instruksi, judul tugas, nama dokumen. */
export function SearchPage() {
  const { view, q, set } = useListState<View>('semua');
  const query = useQuery({ queryKey: ['search', view, q], queryFn: () => api.get<Result[]>(`/search${qs({ q, jenis: view })}`), enabled: Boolean(q) });
  return (
    <Page>
      <PageHeader title="Cari Surat" intro="Ketik sebagian nomor surat, perihal, atau nama pengirim, lalu tekan Cari." />
      <div className="flex flex-col gap-5">
        <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Kata yang dicari" placeholder="Contoh: data peserta didik" />
        <FilterButtons label="Jenis surat" value={view} onChange={(v) => set({ tampil: v })} options={[{ value: 'semua', label: 'Surat masuk dan keluar' }, { value: 'masuk', label: 'Surat masuk saja' }, { value: 'keluar', label: 'Surat keluar saja' }]} />
      </div>
      {!q ? <Empty title="Belum ada pencarian" text="Hasil akan tampil di sini setelah Anda menekan Cari." /> : (
        <Async q={query} empty={<Empty title="Tidak ada surat yang cocok" text="Coba kata yang lebih pendek, atau periksa ejaannya." />} loadingLabel="Sedang mencari…">
          {(rows) => (
            <div className="flex flex-col gap-4">
              <p className="text-lg" aria-live="polite">Ditemukan <strong>{rows.length}</strong> surat{rows.length >= 200 ? ' (hanya 200 pertama yang ditampilkan)' : ''}.</p>
              <ol className="flex flex-col gap-4">
                {rows.map((r) => {
                  const href = r.tipe === 'masuk' ? `/surat-masuk/${r.id}` : `/surat-keluar/${r.id}`;
                  return (
                    <li key={`${r.tipe}-${r.id}`}><Card><CardContent className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone={r.tipe === 'masuk' ? 'accent' : 'neutral'}>{r.tipe === 'masuk' ? 'Surat masuk' : 'Surat keluar'}</Badge><Stamp>{r.no_agenda}</Stamp><span className="font-semibold">{r.statusLabel}</span>{r.sla && r.sla.level !== 'selesai' && <Deadline sla={r.sla} />}</div>
                      <Link href={href} className="font-semibold text-foreground break-words">{r.perihal}</Link>
                      <p className="text-muted-foreground">{r.tipe === 'masuk' ? 'Dari' : 'Kepada'} {r.pihak}. {fmtDate(r.tanggal)}. {r.nomor || 'Belum bernomor'}.</p>
                    </CardContent></Card></li>
                  );
                })}
              </ol>
            </div>
          )}
        </Async>
      )}
    </Page>
  );
}
