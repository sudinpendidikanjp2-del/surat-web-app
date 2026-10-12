import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LettersInPage } from '@/features/letters-in/list-page';

export const metadata: Metadata = { title: 'Surat Masuk' };
export default function Page() { return <Suspense><LettersInPage /></Suspense>; }
