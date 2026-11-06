'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FilePenLineIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Page, PageHeader } from '@/components/app/page';
import { Loading } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { api } from '@/lib/api-client';
import { todayIso } from '@/lib/format';
import { useLetterIn } from '@/features/letters-in/api';
import { RecordForm, recordBody, type RecordValues } from './record-form';

/**
 * Catat surat keluar yang sudah ditandatangani. Isian dapat datang dari surat masuk (?dari=, surat balasan) atau dari
 * halaman Buat Surat (?perihal=&tujuan=&tgl=&jenis=&nomor=&penandatangan=).
 */
export function NewLetterOutPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const dari = sp.get('dari');
  const src = useLetterIn(dari || '', Boolean(dari));
  const create = useAction((v: { values: RecordValues; files: File[] }) => api.upload<{ id: number; no_agenda: string; nomor_surat: string | null }>(
    '/letters-out', { ...recordBody(v.values), letter_in_id: dari || undefined }, { files: v.files },
  ), {
    success: (r) => `Surat keluar ${r.no_agenda} tercatat${r.nomor_surat ? ` dengan nomor ${r.nomor_surat}` : ''}.`,
    keys: ['letters-out', 'dashboard', 'letter', 'timeline', 'letters-in'], onDone: (r) => router.push(`/surat-keluar/${r.id}`),
  });
  const l = dari ? src.data?.letter : undefined;
  const nomor = sp.get('nomor') || '';
  const initial: RecordValues = {
    nomor_mode: 'manual', nomor_surat: nomor, kode_klasifikasi: '',
    tgl_surat: sp.get('tgl') || todayIso(),
    jenis: sp.get('jenis') || 'Surat Dinas', sifat: 'Biasa',
    perihal: sp.get('perihal') || (l ? `Tanggapan atas ${l.perihal}` : ''),
    tujuan: sp.get('tujuan') || (l ? `${l.asal}${l.instansi ? `, ${l.instansi}` : ''}` : ''),
    lampiran: '', penandatangan_id: sp.get('penandatangan') || '', catatan: '',
  };
  return (
    <Page className="max-w-3xl">
      <PageHeader back={{ href: '/surat-keluar', label: 'Surat Keluar' }} title="Catat surat keluar"
        intro={l ? `Surat balasan untuk ${l.no_agenda}: ${l.perihal}.` : 'Catat surat yang sudah ditandatangani: nomor, tujuan, perihal, dan hasil pindainya. Pengiriman dicatat setelahnya.'}>
        <Button asChild variant="outline"><Link href={dari ? `/buat-surat?dari=${dari}` : '/buat-surat'}><FilePenLineIcon aria-hidden /> Belum ada suratnya? Buat dari Template</Link></Button>
      </PageHeader>
      {dari && src.isPending ? <Loading /> : (
        <RecordForm key={l?.id || 0} initial={initial} withFiles pending={create.isPending} submitLabel="Simpan Surat Keluar"
          onSubmit={(values, files) => create.mutate({ values, files })}
          cancel={<Button asChild variant="outline" className="no-underline"><Link href="/surat-keluar">Batal</Link></Button>} />
      )}
    </Page>
  );
}
