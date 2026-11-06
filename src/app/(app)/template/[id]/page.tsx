import { redirect } from 'next/navigation';

/** Alamat lama rincian template: kini di bawah halaman Buat Surat. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/buat-surat/template/${encodeURIComponent(id)}`);
}
