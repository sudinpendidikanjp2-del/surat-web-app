import { QrRedirect } from '@/features/letters-in/qr-redirect';

/** Tujuan kode QR di lembar disposisi: membuka surat yang bersangkutan. */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  return <QrRedirect token={(await params).token} />;
}
