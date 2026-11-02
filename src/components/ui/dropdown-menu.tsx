'use client';
import * as React from 'react';
import { DropdownMenu as M } from 'radix-ui';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Menu tarik-turun shadcn. Muncul dari arah pemicunya (transform-origin dari Radix), 150ms ease-out dari skala 0.97.
 * Dibuka dengan keyboard pun tetap cepat; panah, Enter, dan Escape bekerja bawaan Radix.
 */
const DropdownMenu = M.Root;
const DropdownMenuTrigger = M.Trigger;
const DropdownMenuGroup = M.Group;
const DropdownMenuRadioGroup = M.RadioGroup;

function DropdownMenuContent({ className, sideOffset = 6, align = 'end', ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={sideOffset} align={align}
        className={cn(
          'z-50 min-w-[12rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-2xl border border-border bg-card p-1.5 text-card-foreground shadow-lg',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.97] data-[state=open]:duration-150',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.97] data-[state=closed]:duration-100',
          className,
        )}
        {...props} />
    </M.Portal>
  );
}

const item = 'relative flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-xl px-3 text-base outline-none data-[highlighted]:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 sm:min-h-9 sm:text-sm [&_svg]:size-4 [&_svg]:shrink-0';

function DropdownMenuItem({ className, danger, ...props }: React.ComponentProps<typeof M.Item> & { danger?: boolean }) {
  return <M.Item className={cn(item, danger && 'text-destructive', className)} {...props} />;
}
function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem className={cn(item, 'pl-8', className)} {...props}>
      <M.ItemIndicator className="absolute left-2.5 flex items-center"><CheckIcon /></M.ItemIndicator>
      {children}
    </M.RadioItem>
  );
}
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof M.Label>) {
  return <M.Label className={cn('px-3 py-1.5 text-sm text-muted-foreground', className)} {...props} />;
}
function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof M.Separator>) {
  return <M.Separator className={cn('-mx-1.5 my-1 h-px bg-line', className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuGroup };
