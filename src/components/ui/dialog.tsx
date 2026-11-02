'use client';
import * as React from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { XIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dialog shadcn. Di ponsel naik dari bawah selebar layar (jempol dekat tombol), di layar lebar di tengah.
 * Masuk 200ms ease-out dari skala 0.97 (tidak dari 0), keluar 150ms: sistem merespons lebih cepat dari pengguna.
 * Dialog tetap berpusat (bukan dari pemicu) karena tidak terikat ke satu tombol.
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({ className, children, ...props }: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:duration-200 data-[state=closed]:duration-150" />
      <DialogPrimitive.Content data-slot="dialog-content"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-3xl border border-border bg-card text-card-foreground shadow-xl outline-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:duration-200 data-[state=closed]:duration-150 ease-[var(--ease-out)]',
          'data-[state=open]:slide-in-from-bottom-6 data-[state=closed]:slide-out-to-bottom-6 data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(600px,calc(100vw-32px))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl',
          'sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=open]:zoom-in-[0.97] sm:data-[state=closed]:zoom-out-[0.97]',
          className,
        )}
        {...props}>
        {children}
        <DialogPrimitive.Close className="pressable absolute right-3 top-3 inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:size-9" aria-label="Tutup">
          <XIcon className="size-5" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 px-6 pb-3 pr-14 pt-6', className)} {...props} />;
}
function DialogBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 py-2', className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col-reverse gap-2 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:pb-6', className)} {...props} />;
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-lg font-bold', className)} {...props} />;
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogHeader, DialogBody, DialogFooter, DialogTitle, DialogDescription };
