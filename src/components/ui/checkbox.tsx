'use client';
import * as React from 'react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Kotak centang 28px dengan centang tebal. Seluruh baris (label) dapat diketuk. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root data-slot="checkbox"
      className={cn('peer size-7 shrink-0 rounded-sm border-2 border-input bg-card data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground', className)}
      {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center"><CheckIcon className="size-5" strokeWidth={3.5} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
