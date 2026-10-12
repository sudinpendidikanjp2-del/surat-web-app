import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate, fmtSize } from '@/lib/format';

export interface FileItem { id: number; nama: string; kategori: string; versi: number; ukuran: number; uploader?: string | null; created_at: string }

const KATEGORI: Record<string, string> = { SURAT: 'Surat masuk', PENDUKUNG: 'Pendukung', HASIL: 'Hasil pekerjaan', DRAF: 'Draf', FINAL: 'Dokumen akhir', BUKTI: 'Bukti', TTD: 'Bertanda tangan', DISPOSISI: 'Disposisi' };

export function FileList({ files, empty = 'Belum ada dokumen.' }: { files: FileItem[]; empty?: string }) {
  if (!files.length) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {files.map((f) => (
        <li key={f.id} className="flex flex-col gap-3 rounded-md border-2 border-[#d6d1c4] bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <FileTextIcon className="mt-1 size-6 shrink-0" aria-hidden />
            <div className="min-w-0">
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="break-all font-bold">{f.nama}</a>
              <p className="text-muted-foreground">{KATEGORI[f.kategori] || f.kategori}, versi {f.versi}, {fmtSize(f.ukuran)}. Disimpan {fmtDate(f.created_at)}{f.uploader ? ` oleh ${f.uploader}` : ''}.</p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0 no-underline"><a href={`/api/files/${f.id}?unduh=1`}><DownloadIcon aria-hidden /> Unduh</a></Button>
        </li>
      ))}
    </ul>
  );
}
