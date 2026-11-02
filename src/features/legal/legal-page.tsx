import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Tautan ke kebijakan privasi dan ketentuan layanan; dipakai di halaman umum (masuk, lacak) dan di halaman hukum sendiri. */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Ketentuan" className={cn('flex flex-wrap gap-x-4 text-sm text-muted-foreground', className)}>
      <Link href="/policy" className="inline-flex min-h-11 items-center text-inherit sm:min-h-0">Kebijakan Privasi</Link>
      <Link href="/tos" className="inline-flex min-h-11 items-center text-inherit sm:min-h-0">Ketentuan Layanan</Link>
    </nav>
  );
}

export interface LegalSection { id: string; judul: string; isi: React.ReactNode }

/**
 * Kerangka halaman hukum publik (tanpa login): judul, versi, daftar isi, lalu bagian bernomor.
 * Teks biasa yang dirender server, tanpa skrip klien, agar dapat dibaca peninjau Google dan dicetak.
 */
export function LegalPage({ judul, ringkas, versi, pengelola, sections }: {
  judul: string; ringkas: string; versi: string; pengelola: { nama: string; alamat: string }; sections: LegalSection[];
}) {
  return (
    <main id="isi" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <Link href="/masuk" className="text-sm font-medium text-muted-foreground no-underline hover:text-foreground">{pengelola.nama}</Link>
        <h1 className="text-3xl font-bold tracking-tight">{judul}</h1>
        <p className="max-w-2xl text-muted-foreground">{ringkas}</p>
        <p className="text-sm text-muted-foreground">Versi {versi}</p>
      </header>
      <nav aria-label="Daftar isi" className="rounded-2xl border border-border bg-card p-5">
        <ol className="grid list-decimal gap-1.5 pl-5 text-sm sm:grid-cols-2">
          {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.judul}</a></li>)}
        </ol>
      </nav>
      <div className="flex flex-col gap-8">
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-judul`} className="scroll-mt-6">
            <h2 id={`${s.id}-judul`} className="mb-2 text-lg font-bold">{i + 1}. {s.judul}</h2>
            <div className="legal-body flex flex-col gap-3 leading-relaxed">{s.isi}</div>
          </section>
        ))}
      </div>
      <footer className="flex flex-col gap-3 border-t border-line pt-6">
        <p className="text-sm text-muted-foreground">Pengelola: {pengelola.nama}{pengelola.alamat ? `, ${pengelola.alamat}` : ''}.</p>
        <LegalLinks />
      </footer>
    </main>
  );
}
