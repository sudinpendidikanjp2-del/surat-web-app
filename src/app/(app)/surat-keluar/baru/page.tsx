'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { NewLetterOutPage } from '@/features/letters-out/new-page';

export default function Page() {
  return <Guard allow={can.writeOut}><Suspense><NewLetterOutPage /></Suspense></Guard>;
}
