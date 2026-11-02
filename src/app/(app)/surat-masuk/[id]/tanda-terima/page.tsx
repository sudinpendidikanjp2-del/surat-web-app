import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReceiptPage } from '@/features/letters-in/receipt-page';

export const metadata: Metadata = { title: 'Tanda Terima' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense><ReceiptPage id={id} /></Suspense>;
}
