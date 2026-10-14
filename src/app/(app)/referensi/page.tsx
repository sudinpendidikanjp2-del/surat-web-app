'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { ReferencePage } from '@/features/admin/reference-page';

export default function Page() { return <Guard allow={can.admin}><Suspense><ReferencePage /></Suspense></Guard>; }
