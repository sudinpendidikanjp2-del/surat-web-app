'use client';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { TemplatesPage } from '@/features/templates/list-page';

export default function Page() { return <Guard allow={can.admin}><TemplatesPage /></Guard>; }
