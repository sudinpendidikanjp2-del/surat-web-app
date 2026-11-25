'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { GeneratorPage } from '@/features/generator/generator-page';

export default function Page() {
  return <Guard allow={can.writeOut}><Suspense><GeneratorPage /></Suspense></Guard>;
}
