import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate, fmtSize } from '@/lib/format';

export interface FileItem { id: number; nama: string; kategori: string; versi: number; ukuran: number; uploader?: string | null; created_at: string }

const KATEGORI: Record<string, string> = { SURAT: 'Surat masuk', PENDUKUNG: 'Pendukung', HASIL: 'Hasil pekerjaan', DRAF: 'Draf', FINAL: 'Dokumen akhir', BUKTI: 'Bukti', TTD: 'Bertanda tangan', DISPOSISI: 'Disposisi' };

export function FileList({ files, empty = 'Belum ada dokumen.' }: { files: FileItem[]; empty?: string }) {
  if (!files.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-border bg-card">
      {files.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 gap-3">
            <FileTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="break-all text-sm font-semibold">{f.nama}</a>
              <p className="text-sm text-muted-foreground">{KATEGORI[f.kategori] || f.kategori}, versi {f.versi}, {fmtSize(f.ukuran)}. Disimpan {fmtDate(f.created_at)}{f.uploader ? ` oleh ${f.uploader}` : ''}.</p>
            </div>
          </div>
          <Button asChild variant="ghost" size="icon" className="shrink-0"><a href={`/api/files/${f.id}?unduh=1`} aria-label={`Unduh ${f.nama}`}><DownloadIcon aria-hidden /></a></Button>
        </li>
      ))}
    </ul>
  );
}
