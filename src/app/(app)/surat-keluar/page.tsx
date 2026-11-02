import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LettersOutPage } from '@/features/letters-out/list-page';

export const metadata: Metadata = { title: 'Surat Keluar' };
export default function Page() { return <Suspense><LettersOutPage /></Suspense>; }
