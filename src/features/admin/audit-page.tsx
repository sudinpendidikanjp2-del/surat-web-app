'use client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Pager, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Stamp } from '@/components/app/status';
import { useListState } from '@/components/app/use-list-state';
import { api, qs } from '@/lib/api-client';
import { fmtDateTime } from '@/lib/format';

interface Entry { id: number; aksi: string; entitas: string; entitas_id: string | null; detail: Record<string, unknown> | null; ip: string | null; created_at: string; user_nama: string | null }

const SIZE = 30;
/** USER_DIBUAT menjadi "User dibuat": kode tetap terlihat tetapi lebih mudah dibaca. */
const readable = (aksi: string) => aksi.charAt(0) + aksi.slice(1).toLowerCase().replace(/_/g, ' ');

/** Catatan kegiatan (baca saja): siapa, melakukan apa, kapan. */
export function AuditPage() {
  const { q, page, set } = useListState('semua');
  const query = useQuery({
    queryKey: ['audit', q, page],
    queryFn: () => api.get<{ items: Entry[]; total: number }>(`/audit${qs({ q, limit: SIZE, offset: (page - 1) * SIZE })}`),
  });
  return (
    <Page>
      <PageHeader title="Catatan Kegiatan" intro="Setiap perubahan penting dicatat otomatis dan tidak dapat dihapus." back={{ href: '/lainnya', label: 'Kembali ke Menu Lainnya' }} />
      <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari nomor data atau isi catatan" />
      <Async q={query} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Tidak ada catatan yang cocok" />}>
        {(d) => (
          <div className="flex flex-col gap-5">
            <ol className="flex flex-col gap-3">
              {d.items.map((e) => (
                <li key={e.id}><Card><CardContent className="flex flex-col gap-1">
                  <p className="text-muted-foreground">{fmtDateTime(e.created_at)}</p>
                  <p className="text-lg"><strong>{e.user_nama || 'Sistem'}</strong>: {readable(e.aksi)}</p>
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground">{e.entitas}{e.entitas_id && <Stamp>{e.entitas_id}</Stamp>}{e.ip && <span>dari alamat {e.ip}</span>}</p>
                </CardContent></Card></li>
              ))}
            </ol>
            <Pager page={page} pageSize={SIZE} total={d.total} onPage={(p) => set({ halaman: p })} />
          </div>
        )}
      </Async>
    </Page>
  );
}
