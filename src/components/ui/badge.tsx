import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Penanda status: selalu berupa teks, warna hanya penguat. */
const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-sm border-2 px-2.5 py-0.5 text-base font-bold whitespace-nowrap [&>svg]:size-4', {
  variants: {
    tone: {
      neutral: 'border-[#a8a294] bg-muted text-foreground',
      accent: 'border-primary bg-primary-soft text-[#063d31]',
      ok: 'border-ok bg-ok-soft text-ok',
      warn: 'border-warn bg-warn-soft text-warn',
      late: 'border-late bg-late-soft text-late',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
