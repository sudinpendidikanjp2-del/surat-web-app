'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Empty, Loading } from '@/components/app/states';
import { api, qs } from '@/lib/api-client';
import { fmtDate } from '@/lib/format';

interface Year { tahun: number; masuk: { bulan: number; nama: string; jumlah: number }[]; keluar: { bulan: number; nama: string; jumlah: number }[] }
interface Item { id: number; no_agenda: string; nomor: string | null; perihal: string; pihak: string; tanggal: string; dokumen: number }

function Month({ tahun, jenis, bulan, nama, jumlah }: { tahun: number; jenis: 'masuk' | 'keluar'; bulan: number; nama: string; jumlah: number }) {
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['arsip-daftar', tahun, jenis, bulan], queryFn: () => api.get<Item[]>(`/arsip/daftar${qs({ tahun, jenis, bulan })}`), enabled: open });
  const id = `arsip-${tahun}-${jenis}-${bulan}`;
  return (
    <li className="border-t-2 border-[#e4e0d6] first:border-t-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        className="flex min-h-[56px] w-full cursor-pointer items-center gap-3 px-1 text-left text-lg font-bold hover:bg-muted">
        {open ? <ChevronDownIcon className="size-6" aria-hidden /> : <ChevronRightIcon className="size-6" aria-hidden />}
        {nama} <span className="ml-auto font-semibold text-muted-foreground">{jumlah} surat</span>
      </button>
      {open && (
        <div id={id} className="pb-4 pl-9">
          {q.isPending ? <Loading rows={1} /> : (
            <ul className="flex flex-col gap-3">
              {(q.data || []).map((r) => (
                <li key={r.id} className="flex flex-col">
                  <Link href={jenis === 'masuk' ? `/surat-masuk/${r.id}` : `/surat-keluar/${r.id}`} className="font-bold">{r.perihal}</Link>
                  <span className="text-muted-foreground">{r.no_agenda}, {r.nomor || 'belum bernomor'}, {r.pihak}, {fmtDate(r.tanggal)}. {r.dokumen} dokumen.</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/** Arsip tersusun menurut tahun, jenis, dan bulan, seperti lemari arsip. Tekan nama bulan untuk membukanya. */
export function ArchivePage() {
  const q = useQuery({ queryKey: ['arsip'], queryFn: () => api.get<Year[]>('/arsip') });
  return (
    <Page>
      <PageHeader back={{ href: '/lainnya', label: 'Kembali ke Menu Lainnya' }} title="Arsip Surat" intro="Surat tersusun menurut tahun dan bulan. Tekan nama bulan untuk melihat daftar suratnya." />
      <Async q={q} empty={<Empty title="Arsip masih kosong" text="Surat yang dicatat akan tersusun otomatis di sini." />}>
        {(years) => years.map((y) => (
          <Section key={y.tahun} title={`Tahun ${y.tahun}`}>
            <div className="grid gap-5 md:grid-cols-2">
              {([['masuk', 'Surat masuk', y.masuk], ['keluar', 'Surat keluar', y.keluar]] as const).map(([jenis, label, months]) => (
                <Card key={jenis}><CardContent className="flex flex-col gap-2">
                  <h3 className="text-xl">{label}</h3>
                  {months.every((m) => m.jumlah === 0) ? <p className="text-muted-foreground">Tidak ada surat.</p> : (
                    <ul>{months.filter((m) => m.jumlah > 0).map((m) => <Month key={m.bulan} tahun={y.tahun} jenis={jenis} {...m} />)}</ul>
                  )}
                </CardContent></Card>
              ))}
            </div>
          </Section>
        ))}
      </Async>
    </Page>
  );
}
