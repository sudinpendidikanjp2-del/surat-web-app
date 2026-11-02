import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** Penanda status: chip lembut berisi teks; warna hanya penguat. */
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap [&>svg]:size-3.5', {
  variants: {
    tone: {
      neutral: 'bg-muted text-foreground',
      accent: 'bg-primary-soft text-primary-ink',
      yellow: 'bg-accent-soft text-accent-ink',
      ok: 'bg-ok-soft text-ok',
      warn: 'bg-warn-soft text-warn',
      late: 'bg-late-soft text-late',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
