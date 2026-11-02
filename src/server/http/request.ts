import 'server-only';
import type { NextRequest } from 'next/server';
import type { IncomingFile } from '@/server/application/ports';

export interface Body {
  fields: Record<string, unknown>;
  files: (name: string) => IncomingFile[];
  file: (name: string) => IncomingFile | null;
}

const noFiles = () => [];

/**
 * Baca JSON atau multipart dengan bentuk yang sama. Pada multipart, nilai yang tampak seperti JSON
 * (array atau objek) diurai, karena klien mengirim daftar sebagai teks JSON.
 */
export async function readBody(req: NextRequest): Promise<Body> {
  const type = req.headers.get('content-type') || '';
  if (type.includes('multipart/form-data')) {
    const form = await req.formData();
    const fields: Record<string, unknown> = {};
    const files = new Map<string, IncomingFile[]>();
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') {
        fields[k] = /^[[{]/.test(v) ? safeJson(v) : v;
      } else {
        const list = files.get(k) || [];
        list.push({ name: v.name || 'berkas', type: v.type, buffer: Buffer.from(await v.arrayBuffer()) });
        files.set(k, list);
      }
    }
    return { fields, files: (n) => files.get(n) || [], file: (n) => files.get(n)?.[0] || null };
  }
  const text = await req.text();
  const fields = text ? JSON.parse(text) : {};
  return { fields: fields && typeof fields === 'object' ? fields : {}, files: noFiles, file: () => null };
}

function safeJson(v: string) {
  try { return JSON.parse(v); } catch { return v; }
}
