import type { Metadata } from 'next';
import { TrackingPage } from '@/features/tracking/tracking-page';

export const metadata: Metadata = { title: 'Lacak Surat', robots: { index: false, follow: false }, referrer: 'no-referrer' };

/** Halaman umum tanpa login untuk pengirim surat: cukup kode pelacakan. */
export default async function Page({ params }: { params: Promise<{ code?: string[] }> }) {
  const { code } = await params;
  return <TrackingPage initial={code?.[0] ? decodeURIComponent(code[0]) : ''} />;
}
