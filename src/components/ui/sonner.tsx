'use client';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Pesan singkat di atas tengah, huruf besar, tampil 8 detik agar sempat dibaca, dapat ditutup. */
function Toaster(props: ToasterProps) {
  return (
    <Sonner position="top-center" duration={8000} closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-md !border-2 !text-base !font-semibold !px-5 !py-4 !gap-3',
          success: '!border-ok !bg-ok-soft !text-ok',
          error: '!border-late !bg-late-soft !text-late',
          closeButton: '!size-8 !border-2',
        },
      }}
      {...props} />
  );
}

export { Toaster };
