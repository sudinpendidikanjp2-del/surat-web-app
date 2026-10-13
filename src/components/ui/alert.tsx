import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex w-full gap-3 rounded-md px-4 py-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0', {
  variants: {
    variant: {
      info: 'bg-primary-soft text-primary-ink',
      ok: 'bg-ok-soft text-ok',
      warn: 'bg-warn-soft text-warn',
      late: 'bg-late-soft text-late',
    },
  },
  defaultVariants: { variant: 'info' },
});

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role={variant === 'late' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export { Alert };
