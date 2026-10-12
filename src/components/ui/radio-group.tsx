'use client';
import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

function RadioGroup({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root data-slot="radio-group" className={cn('grid gap-3', className)} {...props} />;
}

function RadioGroupItem({ className, ...props }: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item data-slot="radio-group-item" className={cn('aspect-square size-7 shrink-0 rounded-full border-2 border-input bg-card data-[state=checked]:border-primary', className)} {...props}>
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center"><span className="size-3.5 rounded-full bg-primary" /></RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
