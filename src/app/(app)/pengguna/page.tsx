'use client';
import { Suspense } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { UsersPage } from '@/features/admin/users-page';

export default function Page() { return <Guard allow={can.admin}><Suspense><UsersPage /></Suspense></Guard>; }
