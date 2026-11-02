'use client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';

/**
 * Dialog untuk satu tindakan: judul berupa pertanyaan atau perintah, penjelasan singkat apa yang akan terjadi,
 * isian bila perlu, lalu dua tombol: "Batal" dan tindakan yang ditulis lengkap (misalnya "Kirim Disposisi").
 */
export function ActionDialog({ open, onOpenChange, title, description, error, children, confirmLabel, pending, onConfirm, danger }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: React.ReactNode; error?: string | null;
  children?: React.ReactNode; confirmLabel: string; pending?: boolean; onConfirm: () => void; danger?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {(children || error) && (
          <DialogBody>
            {error && <Alert variant="late">{error}</Alert>}
            {children}
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button variant={danger ? 'destructive-solid' : 'default'} disabled={pending} onClick={onConfirm}>{pending ? 'Sedang diproses…' : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
