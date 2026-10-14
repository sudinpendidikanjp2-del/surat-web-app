/** Klien HTTP untuk /api. Satu tempat untuk header CSRF, sesi kedaluwarsa, dan pesan galat. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'surat-app' };
  let body: BodyInit | undefined;
  if (init.form) body = init.form;
  else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: init.method || 'GET', headers, body, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Tidak dapat terhubung ke server. Periksa sambungan internet Anda, lalu coba lagi.');
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, (isJson && (data as { error?: string })?.error) || 'Terjadi kesalahan. Coba lagi.');
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body }),
  put: <T,>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  /** Kirim formulir dengan file. Nilai objek atau array dikirim sebagai teks JSON. */
  upload: <T,>(path: string, fields: Record<string, unknown> = {}, files: Record<string, File | File[] | null | undefined> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v == null || v === '') continue;
      f.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    for (const [k, v] of Object.entries(files)) for (const file of ([] as (File | null | undefined)[]).concat(v)) if (file) f.append(k, file);
    return request<T>(path, { method: 'POST', form: f });
  },
};

/** POST yang hasilnya file: diunduh lewat tautan sementara. Galat server dibaca sebagai pesan. */
async function download(path: string, body: unknown) {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'X-Requested-With': 'surat-app', 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  if (!res.ok) {
    const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
    throw new ApiError(res.status, data?.error || 'File tidak dapat dibuat. Coba lagi.');
  }
  const name = decodeURIComponent((res.headers.get('content-disposition') || '').match(/filename\*=UTF-8''([^;]+)/)?.[1] || 'unduhan');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const downloadPost = download;

export const qs = (obj: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
