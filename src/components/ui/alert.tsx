import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex w-full gap-3 rounded-md border-2 px-4 py-3 text-base [&>svg]:mt-0.5 [&>svg]:size-6 [&>svg]:shrink-0', {
  variants: {
    variant: {
      info: 'border-primary bg-primary-soft text-[#063d31]',
      ok: 'border-ok bg-ok-soft text-ok',
      warn: 'border-warn bg-warn-soft text-warn',
      late: 'border-late bg-late-soft text-late',
    },
  },
  defaultVariants: { variant: 'info' },
});

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role={variant === 'late' ? 'alert' : 'status'} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export { Alert };
