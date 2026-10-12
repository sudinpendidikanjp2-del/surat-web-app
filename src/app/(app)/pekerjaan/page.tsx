'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { WorkPage } from '@/features/tasks/work-page';

export default function Page() {
  return <Guard allow={can.work}><Suspense><WorkPage /></Suspense></Guard>;
}
