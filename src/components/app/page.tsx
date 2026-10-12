import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Kerangka isi halaman: lebar baca yang nyaman dan jarak antarbagian yang longgar. */
export function Page({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8', className)} {...props} />;
}

/**
 * Judul halaman dengan satu kalimat penjelasan "halaman ini untuk apa", dan tautan kembali yang
 * selalu di tempat yang sama. Orang yang jarang memakai aplikasi tidak perlu menebak.
 */
export function PageHeader({ title, intro, back, children }: { title: React.ReactNode; intro?: React.ReactNode; back?: { href: string; label: string }; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="inline-flex w-fit items-center gap-2 font-semibold no-print">
          <ArrowLeftIcon className="size-5" aria-hidden /> {back.label}
        </Link>
      )}
      <h1 className="text-2xl sm:text-3xl">{title}</h1>
      {intro && <p className="max-w-3xl text-lg text-muted-foreground">{intro}</p>}
      {children && <div className="flex flex-wrap gap-3 pt-1">{children}</div>}
    </header>
  );
}

export function Section({ title, intro, children, className, id }: { title: React.ReactNode; intro?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  const hid = id ? `${id}-judul` : undefined;
  return (
    <section className={cn('flex flex-col gap-4', className)} aria-labelledby={hid} id={id}>
      <div className="flex flex-col gap-1">
        <h2 id={hid} className="text-xl sm:text-2xl">{title}</h2>
        {intro && <p className="text-muted-foreground">{intro}</p>}
      </div>
      {children}
    </section>
  );
}
