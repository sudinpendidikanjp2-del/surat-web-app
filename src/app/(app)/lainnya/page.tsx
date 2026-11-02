import type { Metadata } from 'next';
import { MorePage } from '@/features/more/more-page';

export const metadata: Metadata = { title: 'Menu Lainnya' };
export default function Page() { return <MorePage />; }
