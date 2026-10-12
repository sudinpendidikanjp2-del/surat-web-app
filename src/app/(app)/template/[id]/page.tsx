'use client';
import { use } from 'react';
import { Guard } from '@/components/app/guard';
import { can } from '@/domain/roles';
import { TemplateDetailPage } from '@/features/templates/detail-page';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Guard allow={can.admin}><TemplateDetailPage id={id} /></Guard>;
}
