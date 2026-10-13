'use client';
import { useId, useRef } from 'react';
import { FileIcon, PaperclipIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtSize } from '@/lib/format';

/** Tombol besar "Pilih File" (input file asli tetap dipakai, jadi bisa dengan keyboard), lalu daftar file terpilih. */
export function FilePicker({ files, onChange, multiple = true, accept, label = 'Pilih File', hint }: {
  files: File[]; onChange: (f: File[]) => void; multiple?: boolean; accept?: string; label?: string; hint?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <input ref={ref} id={id} type="file" className="sr-only" multiple={multiple} accept={accept}
        onChange={(e) => { const list = [...(e.target.files || [])]; onChange(multiple ? [...files, ...list] : list.slice(0, 1)); e.target.value = ''; }} />
      <div><Button type="button" variant="outline" onClick={() => ref.current?.click()}><PaperclipIcon aria-hidden /> {label}</Button></div>
      {hint && <p className="text-muted-foreground">{hint}</p>}
      {files.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="File yang dipilih">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2">
              <span className="flex min-w-0 items-center gap-2 break-all"><FileIcon className="size-5 shrink-0" aria-hidden />{f.name} <span className="text-muted-foreground">({fmtSize(f.size)})</span></span>
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(files.filter((_, j) => j !== i))}>Hapus dari daftar</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
