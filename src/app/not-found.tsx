import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="isi" className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12">
      <h1 className="text-3xl">Halaman tidak ditemukan</h1>
      <p className="text-lg">Alamat yang Anda buka tidak ada, atau surat tersebut sudah tidak dapat dilihat.</p>
      <p className="text-lg"><Link href="/">Kembali ke Beranda</Link></p>
    </main>
  );
}
