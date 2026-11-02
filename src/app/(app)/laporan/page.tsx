'use client';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { ReportsPage } from '@/features/reports/reports-page';

export default function Page() { return <Guard allow={can.report}><ReportsPage /></Guard>; }
