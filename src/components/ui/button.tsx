import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tombol shadcn, disesuaikan: tinggi minimal 52px, huruf 18px tebal, selalu berlabel teks.
 * Tanpa animasi skala; umpan balik tekan dari perubahan warna yang jelas.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-5 cursor-pointer select-none',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-[#08463a] active:bg-[#06352c]',
        outline: 'border-2 border-input bg-card text-foreground hover:bg-muted active:bg-[#dcd8ce]',
        destructive: 'border-2 border-destructive bg-card text-destructive hover:bg-late-soft active:bg-[#f5d6d2]',
        'destructive-solid': 'bg-destructive text-destructive-foreground hover:bg-[#7d160f]',
        ghost: 'text-foreground hover:bg-muted underline underline-offset-4',
        link: 'text-primary underline underline-offset-4 decoration-2 px-0 min-h-0',
      },
      size: {
        default: 'min-h-[52px] px-5 text-base',
        sm: 'min-h-[44px] px-4 text-base',
        lg: 'min-h-[60px] px-7 text-lg',
        icon: 'size-[52px]',
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
