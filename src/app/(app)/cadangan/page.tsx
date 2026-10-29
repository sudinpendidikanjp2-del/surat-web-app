'use client';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { BackupPage } from '@/features/admin/backup-page';

export default function Page() { return <Guard allow={can.admin}><BackupPage /></Guard>; }
