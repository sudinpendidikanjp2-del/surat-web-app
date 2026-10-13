import * as React from 'react';
import { cn } from '@/lib/utils';

/** Isian 44px di layar sentuh, 40px di layar lebar. Huruf 16px agar iOS tidak memperbesar halaman. */
const fieldBase = 'w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground placeholder:text-muted-foreground outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none aria-invalid:border-destructive disabled:bg-muted disabled:opacity-70';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldBase, 'h-11 py-2 sm:h-10', className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldBase, 'min-h-[96px] py-2 leading-relaxed', className)} {...props} />;
}

/** Pilihan bawaan peramban: di ponsel membuka pemilih sistem yang sudah dikenal pengguna. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <span className={cn('relative block', className)}>
      <select data-slot="select" className={cn(fieldBase, 'h-11 appearance-none py-2 pr-9 sm:h-10')} {...props}>{children}</select>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
    </span>
  );
}

export { Input, Textarea, NativeSelect };
