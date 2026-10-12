'use client';
import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dialog shadcn, disesuaikan: lebar, di tengah, tombol tutup berlabel "Tutup". Escape menutup.
 * Tidak bergeser atau membesar saat muncul; hanya memudar singkat agar tidak membingungkan.
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content data-slot="dialog-content"
        className={cn('fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col rounded-t-lg border-2 border-[#d6d1c4] bg-card shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(680px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg', className)}
        {...props}>
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex min-h-[44px] items-center gap-1 rounded-md px-3 font-semibold underline underline-offset-4 hover:bg-muted">
          <XIcon className="size-5" aria-hidden /> Tutup
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-2 border-b-2 border-[#e4e0d6] px-5 pb-4 pr-28 pt-5 sm:px-6', className)} {...props} />;
}
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6', className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-3 border-t-2 border-[#e4e0d6] px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6', className)} {...props} />;
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-xl font-bold sm:text-2xl', className)} {...props} />;
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-muted-foreground', className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription };
