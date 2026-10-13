import Link from 'next/link';
import { ChevronLeftIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Kerangka isi halaman: lebar baca yang nyaman. Halaman daftar boleh memakai `wide`. */
export function Page({ className, wide, ...props }: React.ComponentProps<'div'> & { wide?: boolean }) {
  return <div className={cn('mx-auto flex w-full flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6', wide ? 'max-w-7xl' : 'max-w-5xl', className)} {...props} />;
}

/** Judul halaman, satu kalimat penjelasan bila perlu, tautan kembali, dan tindakan utama di kanan. */
export function PageHeader({ title, intro, back, children, meta }: { title: React.ReactNode; intro?: React.ReactNode; back?: { href: string; label: string }; children?: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      {back && (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground no-underline hover:text-foreground no-print">
          <ChevronLeftIcon className="size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
          <h1 className="text-2xl break-words">{title}</h1>
          {intro && <p className="max-w-3xl text-muted-foreground">{intro}</p>}
        </div>
        {children && <div className="no-print flex shrink-0 flex-wrap gap-2">{children}</div>}
      </div>
    </header>
  );
}

export function Section({ title, intro, children, className, id, action }: { title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode; className?: string; id?: string; action?: React.ReactNode }) {
  const hid = id ? `${id}-judul` : undefined;
  return (
    <section className={cn('flex flex-col gap-3', className)} aria-labelledby={hid} id={id}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 id={hid} className="text-lg">{title}</h2>
          {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
