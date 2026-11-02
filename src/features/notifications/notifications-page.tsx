'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BulkBar, SelectAll, SelectRow, useBulkAction, useSelection } from '@/components/app/bulk';
import { FilterButtons, Pager } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useListState } from '@/components/app/use-list-state';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { markRead, useNotifications, type Notice } from './api';

type View = 'semua' | 'belum';
const KEYS = ['notifications', 'dashboard'];

/** Pemberitahuan. Membuka satu pemberitahuan sekaligus menandainya dibaca; beberapa dapat ditandai sekaligus. */
export function NotificationsPage() {
  const router = useRouter();
  const { view, page, set } = useListState<View>('semua');
  const q = useNotifications({ page, belum: view === 'belum' });
  const items = q.data?.items || [];
  const sel = useSelection(items.filter((n) => !n.dibaca).map((n) => n.id), `${view}|${page}`);
  const bulk = useBulkAction(KEYS, (id) => items.find((n) => n.id === id)?.judul || `Pemberitahuan ${id}`);
  const readAll = useAction(() => markRead({ all: true }), { success: 'Semua pemberitahuan ditandai dibaca.', keys: KEYS });
  const open = useAction((n: Notice) => (n.dibaca ? Promise.resolve() : markRead({ ids: [n.id] })), {
    keys: KEYS,
    onDone: (_d, n) => { if (n.link) router.push(n.link); },
  });
  const unread = q.data?.unread ?? 0;
  return (
    <Page>
      <PageHeader title="Pemberitahuan" intro={unread ? `${unread} belum dibaca.` : 'Semua sudah dibaca.'}>
        {unread > 0 && <Button variant="outline" disabled={readAll.isPending} onClick={() => readAll.mutate()}>Tandai semua dibaca</Button>}
      </PageHeader>
      <FilterButtons label="Tampilkan" value={view} onChange={(v) => set({ tampil: v })} options={[{ value: 'semua', label: 'Semua' }, { value: 'belum', label: 'Belum dibaca', count: unread }]} />
      <Async q={q} isEmpty={(d) => d.items.length === 0}
        empty={<Empty title={view === 'belum' ? 'Tidak ada yang belum dibaca' : 'Belum ada pemberitahuan'} text="Pemberitahuan muncul saat ada surat atau pekerjaan baru untuk Anda." />}>
        {(d) => (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card)">
              {sel.count > 0 || d.items.some((n) => !n.dibaca) ? (
                <li className="flex items-center gap-3 bg-muted/60 px-4 py-2 text-sm font-semibold text-muted-foreground"><SelectAll sel={sel} label="Pilih semua yang belum dibaca" /> Pilih yang belum dibaca</li>
              ) : null}
              {d.items.map((n) => (
                <li key={n.id} className={cn('flex gap-3 px-4 py-3', !n.dibaca && 'bg-primary-soft/40')}>
                  <div className="-ml-3 -mr-1 flex size-11 shrink-0 items-start justify-center pt-0.5 sm:ml-0 sm:mr-0 sm:size-auto sm:pt-1">
                    {!n.dibaca ? <SelectRow sel={sel} id={n.id} label={n.judul} /> : <span className="size-[18px]" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <button type="button" onClick={() => open.mutate(n)} className="-my-1 min-h-11 cursor-pointer py-1 text-left font-semibold hover:underline sm:min-h-8">
                      {!n.dibaca && <span className="mr-1.5 inline-block size-2 rounded-full bg-primary align-middle" aria-hidden />}
                      {n.judul}<span className="sr-only">{n.dibaca ? '' : ', belum dibaca'}</span>
                    </button>
                    {n.isi && <p className="text-sm">{n.isi}</p>}
                    <p className="text-sm text-muted-foreground">{fmtDateTime(n.created_at)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => set({ halaman: p })} />
          </div>
        )}
      </Async>
      <BulkBar sel={sel}>
        <Button size="sm" disabled={bulk.pending} onClick={() => bulk.run('/notifications/bulk/dibaca', {}, 'ditandai dibaca', sel)}>Tandai dibaca</Button>
      </BulkBar>
      {bulk.dialog}
    </Page>
  );
}
