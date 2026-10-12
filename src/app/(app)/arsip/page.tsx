import type { Metadata } from 'next';
import { ArchivePage } from '@/features/archive/archive-page';

export const metadata: Metadata = { title: 'Arsip' };
export default function Page() { return <ArchivePage />; }
