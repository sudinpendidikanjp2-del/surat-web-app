import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from './config.js';
import { bad } from './util.js';

const ALLOWED = {
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

const MAGIC = {
  pdf: [Buffer.from('%PDF')],
  png: [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  jpg: [Buffer.from([0xff, 0xd8, 0xff])],
  jpeg: [Buffer.from([0xff, 0xd8, 0xff])],
  docx: [Buffer.from('PK')],
  xlsx: [Buffer.from('PK')],
  doc: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  xls: [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
};

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 10 },
});

export const extOf = (name) => path.extname(name).slice(1).toLowerCase();

/** Validasi ekstensi dan isi file (magic bytes). Melempar 400 jika ditolak. */
export function validateFile(file) {
  const ext = extOf(file.originalname);
  if (!ALLOWED[ext]) throw bad(`Jenis file .${ext || '?'} tidak diizinkan. Gunakan PDF, DOCX, XLSX, JPG, PNG, CSV, atau TXT`);
  const sigs = MAGIC[ext];
  if (sigs && !sigs.some((s) => file.buffer.subarray(0, s.length).equals(s))) throw bad(`Isi file tidak sesuai ekstensi .${ext}`);
  return ext;
}

/** Simpan buffer ke storage privat. Mengembalikan path relatif terhadap storageDir. */
export async function saveBuffer(buffer, ext) {
  const d = new Date();
  const rel = path.join(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), `${crypto.randomUUID()}.${ext}`);
  const abs = path.join(config.storageDir, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
  return rel;
}

export function absPath(rel) {
  const abs = path.resolve(config.storageDir, rel);
  if (!abs.startsWith(path.resolve(config.storageDir) + path.sep)) throw bad('Path file tidak valid');
  return abs;
}

export const mimeFor = (ext) => ALLOWED[ext] || 'application/octet-stream';
