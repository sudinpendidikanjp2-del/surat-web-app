'use client';
import { useQuery } from '@tanstack/react-query';
import { PrinterIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/app/page';
import { Async } from '@/components/app/states';
import { TINDAKAN } from '@/domain/letter-in';
import { useRefValues } from '@/features/reference/api';
import { api } from '@/lib/api-client';
import { fmtDate } from '@/lib/format';

interface Sheet {
  letter: { no_agenda: string; no_surat: string; tgl_surat: string; tgl_diterima: string; asal: string; instansi: string | null; perihal: string; sifat: string; prioritas: string };
  dispositions: { id: number; tindakan: string[]; instruksi: string; deadline: string | null; status: string; dari: string; kepada: string; kepada_jabatan: string | null }[];
  instansi: { nama?: string };
  qr: string;
}

const cell = 'border border-black px-2 py-1.5 align-top text-left';

/** Lembar disposisi kertas, mengikuti bentuk yang lazim di kantor. */
export function DispositionSheetPage({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['lembar', id], queryFn: () => api.get<Sheet>(`/letters-in/${id}/lembar-disposisi`) });
  const tindakanList = useRefValues('tindakan', TINDAKAN);
  return (
    <Page>
      <div className="no-print">
        <PageHeader back={{ href: `/surat-masuk/${id}`, label: 'Surat' }} title="Lembar disposisi" intro="Cetak lembar ini, atau simpan sebagai PDF dari jendela cetak.">
          <Button onClick={() => window.print()}><PrinterIcon aria-hidden /> Cetak Lembar Disposisi</Button>
        </PageHeader>
      </div>
      <Async q={q} isEmpty={() => false}>
        {(d) => {
          const l = d.letter;
          const used = new Set(d.dispositions.flatMap((x) => x.tindakan));
          return (
            <article className="mx-auto w-full max-w-3xl bg-white p-8 font-serif text-[15px] text-black" aria-label="Lembar disposisi">
              <div className="text-center font-bold uppercase">{d.instansi?.nama}</div>
              <h2 className="mt-1 text-center text-xl tracking-wide">DISPOSISI</h2>
              <table className="mt-3 w-full border-collapse">
                <tbody>
                  <tr><th className={`${cell} w-[28%] font-normal`}>Nomor agenda</th><td className={cell}>{l.no_agenda}</td>
                    <td rowSpan={4} className={`${cell} w-[150px] text-center`}><img src={d.qr} alt={`Kode QR ${l.no_agenda}`} width={120} height={120} className="inline" /></td></tr>
                  <tr><th className={`${cell} font-normal`}>Nomor surat</th><td className={cell}>{l.no_surat}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Tanggal surat</th><td className={cell}>{fmtDate(l.tgl_surat)}, diterima {fmtDate(l.tgl_diterima)}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Dari</th><td className={cell}>{l.asal}{l.instansi ? `, ${l.instansi}` : ''}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Perihal</th><td colSpan={2} className={cell}>{l.perihal}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Sifat dan prioritas</th><td colSpan={2} className={cell}>{l.sifat}, {l.prioritas}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Diteruskan kepada</th><td colSpan={2} className={cell}>{d.dispositions.length === 0 ? '...........................' : d.dispositions.map((x) => <div key={x.id}>{x.status === 'DIKEMBALIKAN' ? '☐' : '☑'} {x.kepada}{x.kepada_jabatan ? `, ${x.kepada_jabatan}` : ''}</div>)}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Tindakan</th><td colSpan={2} className={cell}>{tindakanList.map((t) => <div key={t}>{used.has(t) ? '☑' : '☐'} {t}</div>)}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Instruksi</th><td colSpan={2} className={cell}>{d.dispositions.length === 0 ? <div className="min-h-[60px]" /> : d.dispositions.map((x) => <div key={x.id}>{x.instruksi} <em>({x.dari})</em></div>)}</td></tr>
                  <tr><th className={`${cell} font-normal`}>Batas waktu</th><td colSpan={2} className={cell}>{d.dispositions.length ? [...new Set(d.dispositions.map((x) => fmtDate(x.deadline)))].join(', ') : '...........................'}</td></tr>
                </tbody>
              </table>
            </article>
          );
        }}
      </Async>
    </Page>
  );
}
