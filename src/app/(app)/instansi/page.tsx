'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { InstansiPage } from '@/features/admin/instansi-page';

export default function Page() { return <Guard allow={can.manageIn}><Suspense><InstansiPage /></Suspense></Guard>; }
