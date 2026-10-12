'use client';
import Link from 'next/link';
import { FilePlus2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FilterButtons, Pager, SearchForm } from '@/components/app/list-controls';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Stamp, StatusOut } from '@/components/app/status';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { can } from '@/domain/roles';
import { fmtDate } from '@/lib/format';
import { useLettersOut } from './api';

type View = 'semua' | 'saya' | 'menunggu' | 'draf' | 'kirim' | 'selesai';

const PARAMS: Record<View, Record<string, string>> = {
  semua: {}, saya: { mine: '1' }, menunggu: { antrian: 'menunggu_saya' }, draf: { status: 'DRAFT,REVISI' },
  kirim: { status: 'NOMOR_DIBERIKAN,DITANDATANGANI' }, selesai: { status: 'DIKIRIM,SELESAI' },
};

export function LettersOutPage() {
  const user = useUser();
  const { view, q, page, set } = useListState<View>('semua');
  const query = useLettersOut({ ...PARAMS[view], q, page });
  const options: { value: View; label: string }[] = [
    { value: 'semua', label: 'Semua' },
    ...(can.writeOut(user) ? [{ value: 'saya' as View, label: 'Buatan saya' }] : []),
    ...(can.review(user) ? [{ value: 'menunggu' as View, label: 'Menunggu keputusan saya' }] : []),
    { value: 'draf', label: 'Draf' },
    { value: 'kirim', label: 'Menunggu tanda tangan atau kirim' },
    { value: 'selesai', label: 'Sudah dikirim' },
  ];
  return (
    <Page>
      <PageHeader title="Surat Keluar" intro="Surat yang dibuat kantor: dari draf, persetujuan pimpinan, penomoran, tanda tangan, sampai dikirim.">
        {can.writeOut(user) && <Button asChild size="lg" className="no-underline"><Link href="/surat-keluar/baru"><FilePlus2Icon aria-hidden /> Buat Surat Keluar</Link></Button>}
      </PageHeader>
      <div className="flex flex-col gap-5">
        <FilterButtons label="Tampilkan surat" options={options} value={view} onChange={(v) => set({ tampil: v })} />
        <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari surat keluar" placeholder="Nomor, perihal, atau tujuan" />
      </div>
      <Async q={query} isEmpty={(d) => d.items.length === 0}
        empty={<Empty title={q || view !== 'semua' ? 'Tidak ada surat yang cocok' : 'Belum ada surat keluar'} text={can.writeOut(user) ? 'Buat surat dengan tombol Buat Surat Keluar.' : undefined} />}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-4">
              {d.items.map((l) => (
                <li key={l.id}><Card><CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2"><Stamp>{l.no_agenda}</Stamp><StatusOut status={l.status} /></div>
                  <Link href={`/surat-keluar/${l.id}`} className="text-xl font-bold text-foreground break-words">{l.perihal}</Link>
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
                    <dt className="text-muted-foreground">Kepada</dt><dd className="break-words">{l.tujuan}</dd>
                    <dt className="text-muted-foreground">Nomor surat</dt><dd>{l.nomor_surat || 'Belum bernomor'}</dd>
                    <dt className="text-muted-foreground">Tanggal</dt><dd>{fmtDate(l.tgl_surat)}</dd>
                    <dt className="text-muted-foreground">Dibuat oleh</dt><dd>{l.pembuat}{l.asal_agenda ? `, balasan untuk ${l.asal_agenda}` : ''}</dd>
                  </dl>
                  <div><Button asChild variant="outline" className="no-underline"><Link href={`/surat-keluar/${l.id}`}>Buka Surat Ini</Link></Button></div>
                </CardContent></Card></li>
              ))}
            </ol>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => { set({ halaman: p }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      </Async>
    </Page>
  );
}
