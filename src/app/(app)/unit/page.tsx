'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { UnitsPage } from '@/features/admin/units-page';

export default function Page() { return <Guard allow={can.admin}><Suspense><UnitsPage /></Suspense></Guard>; }
