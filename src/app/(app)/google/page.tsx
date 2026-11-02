'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { GooglePage } from '@/features/admin/google-page';

export default function Page() { return <Guard allow={can.admin}><Suspense><GooglePage /></Suspense></Guard>; }
