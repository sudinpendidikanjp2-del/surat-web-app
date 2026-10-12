'use client';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { NewLetterInPage } from '@/features/letters-in/new-page';

export default function Page() {
  return <Guard allow={can.manageIn}><NewLetterInPage /></Guard>;
}
