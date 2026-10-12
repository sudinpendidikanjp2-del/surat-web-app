import * as React from 'react';
import { cn } from '@/lib/utils';

/** Isian 52px, huruf 18px (iOS tidak memperbesar halaman), bingkai tebal agar batasnya jelas. */
const fieldBase = 'w-full min-w-0 rounded-md border-2 border-input bg-card px-4 text-base text-foreground placeholder:text-[#5d584c] outline-none focus-visible:border-ring focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-destructive disabled:bg-muted disabled:opacity-80';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldBase, 'min-h-[52px] py-2', className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return <textarea data-slot="textarea" className={cn(fieldBase, 'min-h-[120px] py-3 leading-relaxed', className)} {...props} />;
}

/** Pilihan bawaan peramban: di ponsel membuka pemilih sistem yang besar dan sudah dikenal pengguna. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <select data-slot="select" className={cn(fieldBase, 'min-h-[52px] appearance-none bg-[length:20px] bg-[right_14px_center] bg-no-repeat py-2 pr-11', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23141414' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props}>
      {children}
    </select>
  );
}

export { Input, Textarea, NativeSelect };
