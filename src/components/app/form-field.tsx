'use client';
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Satu isian formulir: label di atas, tanda wajib berupa kata, petunjuk di bawah isian, galat di bawahnya. */
export function Field({ label, hint, error, required, className, children }: {
  label: React.ReactNode; hint?: React.ReactNode; error?: string | null; required?: boolean; className?: string;
  children: (props: { id: string; 'aria-invalid'?: true; 'aria-describedby'?: string; required?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-petunjuk`;
  const errId = `${id}-galat`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}{required && <span className="font-normal text-muted-foreground"> (wajib)</span>}</Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, required })}
      {hint && <p id={hintId} className="text-sm text-muted-foreground">{hint}</p>}
      {error && <p id={errId} className="text-sm font-medium text-late" role="alert">{error}</p>}
    </div>
  );
}

export function Choices({ legend, hint, children, className }: { legend: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      {hint && <p className="-mt-1 mb-1 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Baris pilihan: seluruh baris dapat diketuk (44px di layar sentuh), terpilih ditandai latar hijau muda. */
export function ChoiceRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted sm:min-h-10 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft', className)}>{children}</label>;
}
