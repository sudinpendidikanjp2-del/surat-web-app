import type { Metadata } from 'next';
import { LetterInDetailPage } from '@/features/letters-in/detail-page';

export const metadata: Metadata = { title: 'Surat Masuk' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <LetterInDetailPage id={(await params).id} />;
}
