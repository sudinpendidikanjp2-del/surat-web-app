import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Kerangka isi halaman. Halaman daftar dan detail memakai `wide`. */
export function Page({ className, wide, ...props }: React.ComponentProps<'div'> & { wide?: boolean }) {
  return <div className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8', wide ? 'max-w-[1400px]' : 'max-w-5xl', className)} {...props} />;
}

/**
 * Judul halaman dengan jejak (breadcrumb) seperti referensi: "Surat Masuk / SM-2026-000002".
 * `back` menjadi bagian pertama jejak. Tindakan halaman di kanan.
 */
export function PageHeader({ title, intro, back, children, meta }: { title: React.ReactNode; intro?: React.ReactNode; back?: { href: string; label: string }; children?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back && (
          <nav aria-label="Jejak halaman" className="no-print text-sm">
            <Link href={back.href} className="font-medium text-muted-foreground no-underline hover:text-foreground">{back.label}</Link>
            <span aria-hidden className="mx-2 text-strong">/</span>
            <span className="inline-block max-w-[50vw] truncate align-bottom text-foreground">{typeof title === 'string' ? title : 'Rincian'}</span>
          </nav>
        )}
        {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
        <h1 className="text-2xl font-bold tracking-tight break-words sm:text-[1.75rem]">{title}</h1>
        {intro && <p className="max-w-3xl text-sm text-muted-foreground">{intro}</p>}
      </div>
      {children && <div className="no-print flex shrink-0 flex-wrap gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, intro, children, className, id, action }: { title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode; className?: string; id?: string; action?: React.ReactNode }) {
  const hid = id ? `${id}-judul` : undefined;
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby={hid} id={id}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={hid} className="text-base font-bold">{title}</h2>
          {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Permukaan putih bersudut 16px untuk tabel dan daftar. */
export function Panel({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('overflow-hidden rounded-2xl border border-border bg-card shadow-(--shadow-card)', className)} {...props} />;
}
