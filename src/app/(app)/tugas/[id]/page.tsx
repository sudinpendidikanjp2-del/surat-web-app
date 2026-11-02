import type { Metadata } from 'next';
import { TaskDetailPage } from '@/features/tasks/detail-page';

export const metadata: Metadata = { title: 'Tugas' };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <TaskDetailPage id={(await params).id} />;
}
