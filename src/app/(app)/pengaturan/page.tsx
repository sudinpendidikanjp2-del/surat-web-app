'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { SettingsPage } from '@/features/admin/settings-page';

export default function Page() { return <Guard allow={can.admin}><Suspense><SettingsPage /></Suspense></Guard>; }
