'use client';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Satu isian formulir: label di atas, keterangan "wajib" sebagai kata (bukan hanya bintang),
 * petunjuk di bawah label, dan pesan galat tepat di bawah isian.
 */
export function Field({ label, hint, error, required, className, children }: {
  label: React.ReactNode; hint?: React.ReactNode; error?: string | null; required?: boolean; className?: string;
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string; required?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-petunjuk`;
  const errId = `${id}-galat`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <Label htmlFor={id}>{label}{required ? <span className="font-semibold text-muted-foreground"> (wajib)</span> : <span className="font-normal text-muted-foreground"> (boleh dikosongkan)</span>}</Label>
      {hint && <p id={hintId} className="-mt-1 text-muted-foreground">{hint}</p>}
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {error && <p id={errId} className="font-bold text-late" role="alert">{error}</p>}
    </div>
  );
}

/** Kelompok pilihan (kotak centang atau radio) dengan judul. */
export function Choices({ legend, hint, children, className }: { legend: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-2', className)}>
      <legend className="mb-1 text-base font-bold">{legend}</legend>
      {hint && <p className="-mt-1 mb-1 text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Baris pilihan setinggi 52px: seluruh baris dapat diketuk, bukan hanya kotaknya. */
export function ChoiceRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn('flex min-h-[52px] cursor-pointer items-center gap-4 rounded-md border-2 border-[#d6d1c4] bg-card px-4 py-2 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft', className)}>{children}</label>;
}
