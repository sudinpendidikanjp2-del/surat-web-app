'use client';
import Link from 'next/link';
import { InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { Deadline, Stamp, StatusIn } from '@/components/app/status';
import { FilterButtons, Pager, SearchForm } from '@/components/app/list-controls';
import { useListState } from '@/components/app/use-list-state';
import { useUser } from '@/components/app/user-context';
import { can } from '@/domain/roles';
import { fmtDate } from '@/lib/format';
import { useLettersIn, type LetterInRow } from './api';

type View = 'semua' | 'perlu' | 'proses' | 'terlambat' | 'selesai';

const PROSES = 'MENUNGGU_DISPOSISI,DIDISPOSISIKAN,SEDANG_DIPROSES,MENUNGGU_KONFIRMASI,MENUNGGU_PERSETUJUAN';

function paramsFor(view: View, role: string): Record<string, string> {
  if (view === 'perlu') return role === 'tu' ? { antrian: 'belum_diteruskan' } : { status: 'MENUNGGU_DISPOSISI' };
  if (view === 'proses') return { status: PROSES };
  if (view === 'terlambat') return { antrian: 'terlambat' };
  if (view === 'selesai') return { status: 'SELESAI,DIARSIPKAN' };
  return {};
}

/** Satu surat dalam daftar: perihal besar, pengirim, tanggal, status, dan sisa waktu. Satu tombol "Buka". */
export function LetterInCard({ l }: { l: LetterInRow }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2"><Stamp>{l.no_agenda}</Stamp><StatusIn status={l.status} />{l.sifat !== 'Biasa' && <span className="font-bold">Sifat: {l.sifat}</span>}</div>
        <Link href={`/surat-masuk/${l.id}`} className="text-xl font-bold text-foreground break-words">{l.perihal}</Link>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">Dari</dt><dd className="break-words">{l.asal}{l.instansi ? `, ${l.instansi}` : ''}</dd>
          <dt className="text-muted-foreground">Diterima</dt><dd>{fmtDate(l.tgl_diterima)}</dd>
          <dt className="text-muted-foreground">Sekarang di</dt><dd>{l.pic || (l.status === 'DITERIMA' ? 'Tata Usaha' : l.status === 'MENUNGGU_DISPOSISI' ? 'Pimpinan' : '-')}</dd>
          <dt className="text-muted-foreground">Batas waktu</dt><dd className="flex flex-wrap gap-x-3">{fmtDate(l.deadline)} <Deadline sla={l.sla} /></dd>
        </dl>
        <div><Button asChild variant="outline" className="no-underline"><Link href={`/surat-masuk/${l.id}`}>Buka Surat Ini</Link></Button></div>
      </CardContent>
    </Card>
  );
}

export function LettersInPage() {
  const user = useUser();
  const { view, q, page, set } = useListState<View>('semua');
  const query = useLettersIn({ ...paramsFor(view, user.role), q, page });
  const options: { value: View; label: string }[] = [
    { value: 'semua', label: 'Semua' },
    ...(can.manageIn(user) ? [{ value: 'perlu' as View, label: 'Belum diteruskan' }] : can.dispose(user) ? [{ value: 'perlu' as View, label: 'Menunggu disposisi saya' }] : []),
    { value: 'proses', label: 'Masih dikerjakan' },
    { value: 'terlambat', label: 'Terlambat' },
    { value: 'selesai', label: 'Selesai' },
  ];
  return (
    <Page>
      <PageHeader title="Surat Masuk" intro="Semua surat yang diterima kantor, beserta posisi dan batas waktunya.">
        {can.manageIn(user) && <Button asChild size="lg" className="no-underline"><Link href="/surat-masuk/baru"><InboxIcon aria-hidden /> Catat Surat Masuk</Link></Button>}
      </PageHeader>
      <div className="flex flex-col gap-5">
        <FilterButtons label="Tampilkan surat" options={options} value={view} onChange={(v) => set({ tampil: v })} />
        <SearchForm value={q} onSearch={(v) => set({ q: v })} label="Cari surat masuk" placeholder="Nomor surat, perihal, atau pengirim" />
      </div>
      <Async q={query} isEmpty={(d) => d.items.length === 0} loadingLabel="Sedang memuat daftar surat…"
        empty={q || view !== 'semua'
          ? <Empty title="Tidak ada surat yang cocok" text="Coba kata lain, atau pilih tampilan Semua." action={<Button variant="outline" onClick={() => set({ tampil: 'semua', q: '' })}>Tampilkan Semua Surat</Button>} />
          : <Empty title="Belum ada surat masuk" text={can.manageIn(user) ? 'Catat surat pertama dengan tombol Catat Surat Masuk di atas.' : 'Surat yang dicatat Tata Usaha akan tampil di sini.'} />}>
        {(d) => (
          <div className="flex flex-col gap-4">
            <ol className="flex flex-col gap-4">{d.items.map((l) => <li key={l.id}><LetterInCard l={l} /></li>)}</ol>
            <Pager page={d.page} pageSize={d.pageSize} total={d.total} onPage={(p) => { set({ halaman: p }); window.scrollTo({ top: 0 }); }} />
          </div>
        )}
      </Async>
    </Page>
  );
}
