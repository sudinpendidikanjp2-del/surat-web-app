import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { invalid } from '@/domain/errors';
import type { FileStorage, IncomingFile } from '@/server/application/ports';

const ALLOWED: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  csv: 'text/csv',
  txt: 'text/plain',
};

const MAGIC: Record<string, Buffer[]> = {
  pdf: [Buffer.from('%PDF')],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  docx: [Buffer.from('PK')],
  xlsx: [Buffer.from('PK')],
  doc: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  xls: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
};

const extOf = (name: string) => path.extname(name).slice(1).toLowerCase();

/** Penyimpanan file di disk lokal, di luar folder publik. Path relatif disimpan di database. */
export function localFileStorage(root: string, maxBytes: number): FileStorage {
  const abs = (rel: string) => {
    const p = path.resolve(/* turbopackIgnore: true */ root, rel);
    if (!p.startsWith(path.resolve(root) + path.sep)) throw invalid('Path file tidak valid');
    return p;
  };
  return {
    validate(file: IncomingFile) {
      if (file.buffer.length > maxBytes) throw invalid(`File terlalu besar (maks ${Math.round(maxBytes / 1048576)} MB)`);
      const ext = extOf(file.name);
      if (!ALLOWED[ext]) throw invalid(`Jenis file .${ext || '?'} tidak diizinkan. Gunakan PDF, DOCX, XLSX, JPG, PNG, CSV, atau TXT`);
      const sigs = MAGIC[ext];
      if (sigs && !sigs.some((s) => file.buffer.subarray(0, s.length).equals(s))) throw invalid(`Isi file tidak sesuai dengan jenisnya (.${ext})`);
      return ext;
    },
    async save(buffer, ext) {
      const d = new Date();
      const rel = path.join(/* turbopackIgnore: true */ String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), `${crypto.randomUUID()}.${ext}`);
      const p = abs(rel);
      await fs.mkdir(path.dirname(p), { recursive: true });
      await fs.writeFile(p, buffer);
      return rel;
    },
    read: (rel) => fs.readFile(abs(rel)),
    mimeFor: (ext) => ALLOWED[ext] || 'application/octet-stream',
  };
}
