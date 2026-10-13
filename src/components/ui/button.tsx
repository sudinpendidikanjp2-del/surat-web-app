import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tombol shadcn. Tinggi 44px di layar sentuh (target ketuk) dan 40px di layar lebar.
 * Umpan balik tekan: mengecil 3% seketika (kelas `pressable`), warna berubah saat disorot.
 */
const buttonVariants = cva(
  'pressable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold no-underline disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline: 'border border-input bg-card text-foreground hover:bg-muted',
        secondary: 'bg-muted text-foreground hover:bg-line',
        destructive: 'border border-destructive bg-card text-destructive hover:bg-late-soft',
        'destructive-solid': 'bg-destructive text-destructive-foreground hover:bg-destructive-hover',
        ghost: 'text-foreground hover:bg-muted',
        link: 'h-auto px-0 text-primary underline underline-offset-3',
      },
      size: {
        default: 'h-11 px-4 text-base sm:h-10',
        sm: 'h-11 px-3 text-sm sm:h-8',
        lg: 'h-12 px-5 text-base',
        icon: 'size-11 sm:size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
