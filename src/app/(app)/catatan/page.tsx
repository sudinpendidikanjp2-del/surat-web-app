'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { AuditPage } from '@/features/admin/audit-page';

export default function Page() { return <Guard allow={can.audit}><Suspense><AuditPage /></Suspense></Guard>; }
