'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FilterButtons, Pager } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import { fmtDateTime } from '@/lib/format';
import { markRead, useNotifications, type Notice } from './api';

type View = 'semua' | 'belum';

/** Daftar pemberitahuan. Membuka satu pemberitahuan sekaligus menandainya sudah dibaca. */
export function NotificationsPage() {
  const router = useRouter();
  const { view, page, set } = useListState<View>('semua');
  const q = useNotifications({ page, belum: view === 'belum' });
  const readAll = useAction(() => markRead({ all: true }), { success: 'Semua pemberitahuan sudah ditandai dibaca.', keys: ['notifications', 'dashboard'] });
  const open = useAction((n: Notice) => (n.dibaca ? Promise.resolve() : markRead({ ids: [n.id] })), {
    keys: ['notifications', 'dashboard'],
    onDone: (_d, n) => { if (n.link) router.push(n.link); },
  });
  const unread = q.data?.unread ?? 0;
  return (
    <Page>
      <PageHeader title="Pemberitahuan" intro={unread ? `Ada ${unread} pemberitahuan yang belum Anda baca.` : 'Semua pemberitahuan sudah Anda baca.'}>
        {unread > 0 && <Button variant="outline" disabled={readAll.isPending} onClick={() => readAll.mutate()}>{readAll.isPending ? 'Sedang diproses…' : 'Tandai Semua Sudah Dibaca'}</Button>}
      </PageHeader>
      <FilterButtons label="Tampilkan" value={view} onChange={(v) => set({ tampil: v })} options={[{ value: 'semua', label: 'Semua' }, { value: 'belum', label: 'Belum dibaca' }]} />
      <Async q={q} isEmpty={(d) => d.items.length === 0}
        empty={<Empty title={view === 'belum' ? 'Tidak ada yang belum dibaca' : 'Belum ada pemberitahuan'} text="Pemberitahuan muncul saat ada surat atau pekerjaan baru untuk Anda." />}>
        {(d) => (
          <div className="flex flex-col gap-5">
            <ol className="flex flex-col gap-3">
              {d.items.map((n) => (
                <li key={n.id}>
                  <Card className={n.dibaca ? '' : 'border-primary'}>
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {!n.dibaca && <Badge tone="accent">Baru</Badge>}
                        <span className="text-muted-foreground">{fmtDateTime(n.created_at)}</span>
                      </div>
                      <p className="text-xl font-bold">{n.judul}</p>
                      {n.isi && <p>{n.isi}</p>}
                      <div className="flex flex-wrap gap-3 pt-1">
                        {n.link ? <Button onClick={() => open.mutate(n)}>Buka</Button>
                          : !n.dibaca && <Button variant="outline" onClick={() => open.mutate(n)}>Tandai Sudah Dibaca</Button>}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ol>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set({ halaman: p })} />
          </div>
        )}
      </Async>
      <p><Link href="/">Kembali ke Beranda</Link></p>
    </Page>
  );
}
