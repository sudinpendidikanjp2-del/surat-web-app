import type { Metadata } from 'next';
import { LetterOutDetailPage } from '@/features/letters-out/detail-page';

export const metadata: Metadata = { title: 'Surat Keluar' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <LetterOutDetailPage id={(await params).id} />;
}
