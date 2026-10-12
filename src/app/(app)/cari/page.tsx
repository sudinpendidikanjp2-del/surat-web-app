import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchPage } from '@/features/search/search-page';

export const metadata: Metadata = { title: 'Cari Surat' };
export default function Page() { return <Suspense><SearchPage /></Suspense>; }
