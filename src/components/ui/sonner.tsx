'use client';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/components/app/theme';

/** Pesan hasil tindakan di kanan bawah; di ponsel di atas bilah menu bawah. Warna dari token tema (kontras terjaga di kedua tema). */
function Toaster(props: ToasterProps) {
  const { resolved } = useTheme();
  return (
    <Sonner theme={resolved} position="bottom-right" mobileOffset={{ bottom: 84 }} duration={5000} closeButton
      toastOptions={{ classNames: {
        toast: '!rounded-lg !border !border-border !bg-card !text-card-foreground !text-sm !font-medium !shadow-lg',
        success: '!border-ok/40 [&_[data-icon]]:!text-ok',
        error: '!border-late/50 !bg-late-soft !text-late',
        closeButton: '!border-border !bg-card !text-foreground',
      } }}
      {...props} />
  );
}

export { Toaster };
