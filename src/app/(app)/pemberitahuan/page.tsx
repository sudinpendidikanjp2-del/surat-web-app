import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NotificationsPage } from '@/features/notifications/notifications-page';

export const metadata: Metadata = { title: 'Pemberitahuan' };
export default function Page() { return <Suspense><NotificationsPage /></Suspense>; }
