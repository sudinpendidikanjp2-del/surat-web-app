import { DispositionSheetPage } from '@/features/letters-in/print-page';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <DispositionSheetPage id={(await params).id} />;
}
