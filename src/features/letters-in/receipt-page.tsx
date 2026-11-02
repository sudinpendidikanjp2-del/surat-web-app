'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2Icon, CopyIcon, PrinterIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/app/page';
import { Async } from '@/components/app/states';
import { Stamp } from '@/components/app/status';
import { useAction } from '@/components/app/use-action';
import { useBranding } from '@/components/app/branding';
import { api } from '@/lib/api-client';
import { fmtDate, fmtDateTime } from '@/lib/format';

interface Receipt {
  letter: { id: number; no_agenda: string; no_surat: string; tgl_surat: string; tgl_diterima: string; asal: string; instansi: string | null; perihal: string; sifat: string; lampiran: string | null };
  kantor: { nama?: string; alamat?: string; kota?: string };
  tracking: { kode: string; url: string; aktif: boolean; rahasia: boolean; qr: string | null };
  penerima: string;
}

/**
 * Tanda terima untuk pengirim surat: bukti diterima, kode unik, dan QR menuju halaman Lacak Surat.
 * Pengirim tidak perlu akun; cukup memindai QR atau mengetik kodenya.
 */
export function ReceiptPage({ id }: { id: string }) {
  const fresh = useSearchParams().get('baru') === '1';
  const b = useBranding();
  const q = useQuery({ queryKey: ['receipt', id], queryFn: () => api.get<Receipt>(`/letters-in/${id}/tanda-terima`) });
  const enable = useAction(() => api.post(`/letters-in/${id}/pelacakan`, { aksi: 'aktifkan' }), { success: 'Pelacakan diaktifkan.', keys: ['receipt'] });
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.success('Disalin.'); } catch { toast.error('Tidak dapat menyalin. Salin secara manual.'); } };
  return (
    <Page className="max-w-3xl">
      <Async q={q} isEmpty={() => false} loadingLabel="Menyiapkan tanda terima…">
        {(r) => (
          <>
            <PageHeader back={{ href: `/surat-masuk/${r.letter.id}`, label: r.letter.no_agenda }} title="Tanda terima surat">
              <Button variant="outline" onClick={() => window.print()}><PrinterIcon aria-hidden /> Cetak</Button>
              <Button asChild variant="dark"><Link href={`/surat-masuk/${r.letter.id}`}>Buka surat</Link></Button>
              {fresh && <Button asChild><Link href="/surat-masuk/baru">Catat surat lain</Link></Button>}
            </PageHeader>
            {fresh && <Alert variant="ok" className="no-print"><CheckCircle2Icon aria-hidden /><span>Surat tersimpan dengan nomor agenda <strong>{r.letter.no_agenda}</strong>. Berikan tanda terima ini kepada pengirim agar dapat memantau suratnya.</span></Alert>}
            <Card className="print:border-black print:shadow-none">
              <CardContent className="flex flex-col gap-6 p-6 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-5">
                  <div className="flex flex-col">
                    <span className="text-lg font-extrabold">{r.kantor.nama || b.nama}</span>
                    {(r.kantor.alamat || r.kantor.kota) && <span className="text-sm text-muted-foreground">{[r.kantor.alamat, r.kantor.kota].filter(Boolean).join(', ')}</span>}
                  </div>
                  <Stamp>{r.letter.no_agenda}</Stamp>
                </div>
                <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
                    {([['Perihal', r.letter.perihal], ['Nomor surat', r.letter.no_surat], ['Tanggal surat', fmtDate(r.letter.tgl_surat)], ['Pengirim', `${r.letter.asal}${r.letter.instansi ? `, ${r.letter.instansi}` : ''}`],
                      ['Lampiran', r.letter.lampiran || '-'], ['Diterima', fmtDate(r.letter.tgl_diterima)], ['Diterima oleh', r.penerima], ['Dicetak', fmtDateTime(new Date().toISOString())]] as const).map(([k, v]) => (
                      <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium break-words">{v}</dd></div>
                    ))}
                  </dl>
                  {r.tracking.aktif && r.tracking.qr && (
                    <div className="flex flex-col items-center gap-2 rounded-2xl bg-muted p-4 print:bg-transparent">
                      <img src={r.tracking.qr} alt={`Kode QR menuju halaman lacak surat ${r.letter.no_agenda}`} width={180} height={180} className="rounded-lg bg-white p-2" />
                      <span className="text-xs text-muted-foreground">Pindai untuk melacak</span>
                    </div>
                  )}
                </div>
                {r.tracking.aktif ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-strong p-5">
                    <p className="text-sm font-semibold">Kode lacak surat</p>
                    <p className="font-mono text-2xl font-bold tracking-wider break-all">{r.tracking.kode}</p>
                    <p className="text-sm text-muted-foreground">Pantau perkembangan surat di <span className="font-medium text-foreground break-all">{r.tracking.url.replace(/\/lacak\/.*/, '/lacak')}</span> dengan memasukkan kode di atas, atau pindai kode QR. Kode berlaku sampai 30 hari setelah surat selesai.</p>
                    <div className="no-print flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => copy(r.tracking.kode)}><CopyIcon aria-hidden /> Salin kode</Button>
                      <Button size="sm" variant="outline" onClick={() => copy(r.tracking.url)}><CopyIcon aria-hidden /> Salin tautan lacak</Button>
                      <Button asChild size="sm" variant="ghost"><a href={r.tracking.url} target="_blank" rel="noreferrer">Lihat halaman lacak</a></Button>
                    </div>
                  </div>
                ) : (
                  <Alert variant="warn" className="flex-col items-start">
                    <span>{r.tracking.rahasia ? 'Surat bersifat Rahasia, jadi pelacakan oleh pengirim mati secara bawaan.' : 'Pelacakan oleh pengirim sedang dimatikan.'} Aktifkan bila pengirim boleh memantau tahapan umum surat ini.</span>
                    <Button size="sm" variant="outline" className="no-print mt-2" disabled={enable.isPending} onClick={() => enable.mutate()}>Aktifkan pelacakan</Button>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Async>
    </Page>
  );
}
