import crypto from 'node:crypto';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { invalid, unavailable } from '@/domain/errors';
import type { DriveFile, GoogleApi, GoogleAuth, SheetTable } from '@/server/application/ports';

/**
 * Klien Google Drive v3 dan Sheets v4 lewat REST, tanpa SDK.
 * Akun layanan: token dari JWT bertanda tangan RS256 dengan kunci privatnya. OAuth: token dari refresh token.
 * Alamat dasar dapat diganti (variabel lingkungan) agar pengujian memakai server tiruan.
 */
export interface GoogleUrls { oauth: string; accounts: string; api: string; sheets: string }

const SCOPES_SERVICE = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
// Akun Google biasa: hanya file yang dibuat aplikasi ini (drive.file), bukan seluruh Drive pengguna.
const SCOPES_OAUTH = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets openid email';
const FOLDER = 'application/vnd.google-apps.folder';
const FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink';
const ALL_DRIVES = 'supportsAllDrives=true';

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

interface GoogleErrorBody { error?: { message?: string; status?: string; errors?: { reason?: string }[] } | string; error_description?: string }

/** Terjemahkan galat Google menjadi pesan yang dapat ditindaklanjuti admin. */
function explain(status: number, body: GoogleErrorBody, who: string) {
  const err = typeof body.error === 'object' ? body.error : null;
  const reason = err?.errors?.[0]?.reason || (typeof body.error === 'string' ? body.error : '') || err?.status || '';
  const detail = err?.message || body.error_description || '';
  if (reason === 'invalid_grant' || status === 401) return invalid('Akses ke Google ditolak atau kedaluwarsa. Hubungkan ulang akun Google, atau periksa kunci akun layanan.');
  if (reason === 'invalid_client') return invalid('Client ID atau Client Secret OAuth tidak dikenali Google.');
  if (reason === 'storageQuotaExceeded') return invalid('Akun layanan tidak punya ruang penyimpanan Drive sendiri. Pakai folder di Shared Drive yang anggotanya termasuk akun layanan, atau hubungkan akun Google biasa.');
  if (status === 404) return invalid(`Folder atau spreadsheet tidak ditemukan. Pastikan ID benar dan sudah dibagikan ke ${who} sebagai Editor.`);
  if (status === 403) return invalid(`Google menolak akses (${detail || reason || 'izin kurang'}). Pastikan ${who} punya akses Editor, dan Google Drive API serta Google Sheets API sudah diaktifkan.`);
  if (status === 429) return unavailable('Google sedang membatasi permintaan. Coba lagi beberapa menit lagi.');
  return unavailable(`Google mengembalikan galat ${status}${detail ? `: ${detail}` : ''}`);
}

export function googleClient(urls: GoogleUrls): GoogleApi {
  const tokens = new Map<string, { token: string; until: number }>();
  const who = (a: GoogleAuth) => (a.mode === 'service' ? a.client_email : 'akun Google yang terhubung');
  const keyOf = (a: GoogleAuth) => (a.mode === 'service' ? `s:${a.client_email}` : `o:${crypto.createHash('sha256').update(a.refresh_token).digest('hex')}`);

  async function tokenRequest(form: Record<string, string>, a: GoogleAuth | null) {
    let res: Response;
    try {
      res = await fetch(`${urls.oauth}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
    } catch {
      throw unavailable('Server tidak dapat menghubungi Google. Periksa sambungan internet server.');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw explain(res.status, body, a ? who(a) : 'akun ini');
    return body as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
  }

  async function accessToken(a: GoogleAuth) {
    const k = keyOf(a);
    const cached = tokens.get(k);
    if (cached && cached.until > Date.now() + 60_000) return cached.token;
    let t;
    if (a.mode === 'service') {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: a.client_email, scope: SCOPES_SERVICE, aud: `${urls.oauth}/token`, iat: now, exp: now + 3600 }))}`;
      let sig: Buffer;
      try { sig = crypto.sign('RSA-SHA256', Buffer.from(unsigned), a.private_key); } catch { throw invalid('Kunci privat akun layanan tidak valid. Unggah ulang file JSON dari Google Cloud.'); }
      t = await tokenRequest({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }, a);
    } else {
      t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: a.refresh_token, client_id: a.client_id, client_secret: a.client_secret }, a);
    }
    tokens.set(k, { token: t.access_token, until: Date.now() + (t.expires_in || 3600) * 1000 });
    return t.access_token;
  }

  async function call<T>(a: GoogleAuth, url: string, init: RequestInit & { raw?: boolean } = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await accessToken(a)}`);
    if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers, ...(init.body instanceof ReadableStream ? { duplex: 'half' } : {}) } as RequestInit);
    } catch {
      throw unavailable('Server tidak dapat menghubungi Google. Periksa sambungan internet server.');
    }
    if (!res.ok) throw explain(res.status, await res.json().catch(() => ({})), who(a));
    if (init.raw) return res as T;
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  const drive = (path: string, params = '') => `${urls.api}/drive/v3/${path}?${ALL_DRIVES}${params ? `&${params}` : ''}`;

  async function findFolder(a: GoogleAuth, name: string, parentId: string | null) {
    const where = `name='${q(name)}' and mimeType='${FOLDER}' and trashed=false${parentId ? ` and '${q(parentId)}' in parents` : ''}`;
    const r = await call<{ files: DriveFile[] }>(a, drive('files', `includeItemsFromAllDrives=true&fields=files(${FILE_FIELDS})&q=${encodeURIComponent(where)}`));
    return r.files[0]?.id ?? null;
  }

  async function multipart(a: GoogleAuth, o: { name: string; mime: string; parentId: string; body: Buffer; fileId?: string | null }) {
    const boundary = `surat${crypto.randomUUID()}`;
    const meta = o.fileId ? { name: o.name } : { name: o.name, parents: [o.parentId] };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${o.mime}\r\n\r\n`),
      o.body,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    const url = `${urls.api}/upload/drive/v3/files${o.fileId ? `/${encodeURIComponent(o.fileId)}` : ''}?uploadType=multipart&${ALL_DRIVES}&fields=${FILE_FIELDS}`;
    return call<DriveFile>(a, url, { method: o.fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  }

  /** File besar (arsip cadangan): unggahan bersambung, isi dialirkan dari disk tanpa dimuat ke memori. */
  async function resumable(a: GoogleAuth, o: { name: string; mime: string; parentId: string; path: string; size: number }) {
    const init = await call<Response>(a, `${urls.api}/upload/drive/v3/files?uploadType=resumable&${ALL_DRIVES}&fields=${FILE_FIELDS}`, {
      method: 'POST', raw: true,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': o.mime, 'X-Upload-Content-Length': String(o.size) },
      body: JSON.stringify({ name: o.name, parents: [o.parentId] }),
    });
    const location = init.headers.get('location');
    if (!location) throw unavailable('Google tidak memberi alamat unggahan');
    const stream = Readable.toWeb(fs.createReadStream(o.path)) as ReadableStream<Uint8Array>;
    return call<DriveFile>(a, location, { method: 'PUT', headers: { 'Content-Type': o.mime, 'Content-Length': String(o.size) }, body: stream });
  }

  const sheetsUrl = (id: string, rest = '') => `${urls.sheets}/v4/spreadsheets/${encodeURIComponent(id)}${rest}`;

  return {
    authUrl(clientId, redirectUri, state) {
      const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES_OAUTH, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
      return `${urls.accounts}/o/oauth2/v2/auth?${p}`;
    },
    async exchangeCode(clientId, clientSecret, code, redirectUri) {
      const t = await tokenRequest({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }, null);
      if (!t.refresh_token) throw invalid('Google tidak memberi izin akses berkelanjutan. Cabut akses aplikasi di akun Google Anda, lalu hubungkan ulang.');
      let email: string | null = null;
      try { email = JSON.parse(Buffer.from(String(t.id_token).split('.')[1], 'base64url').toString('utf8')).email ?? null; } catch { email = null; }
      return { refresh_token: t.refresh_token, email };
    },
    async whoami(a) {
      const r = await call<{ user?: { emailAddress?: string } }>(a, drive('about', 'fields=user(emailAddress)'));
      return r.user?.emailAddress || (a.mode === 'service' ? a.client_email : '');
    },
    async folder(a, name, parentId) {
      const found = await findFolder(a, name, parentId);
      if (found) return found;
      const r = await call<DriveFile>(a, drive('files', 'fields=id'), { method: 'POST', body: JSON.stringify({ name, mimeType: FOLDER, ...(parentId ? { parents: [parentId] } : {}) }) });
      return r.id;
    },
    upload(a, o) {
      if (Buffer.isBuffer(o.body)) return multipart(a, { ...o, body: o.body });
      return resumable(a, { ...o, path: o.body.path, size: o.body.size });
    },
    async list(a, parentId, nameContains) {
      const where = `'${q(parentId)}' in parents and trashed=false${nameContains ? ` and name contains '${q(nameContains)}'` : ''}`;
      const r = await call<{ files: DriveFile[] }>(a, drive('files', `includeItemsFromAllDrives=true&pageSize=200&orderBy=modifiedTime desc&fields=files(${FILE_FIELDS})&q=${encodeURIComponent(where)}`));
      return r.files;
    },
    async download(a, fileId) {
      const res = await call<Response>(a, drive(`files/${encodeURIComponent(fileId)}`, 'alt=media'), { raw: true });
      if (!res.body) throw unavailable('File dari Google Drive kosong');
      return res.body;
    },
    async remove(a, fileId) {
      await call(a, drive(`files/${encodeURIComponent(fileId)}`), { method: 'DELETE' });
    },
    async createSpreadsheet(a, title, parentId) {
      const r = await call<DriveFile>(a, drive('files', 'fields=id'), { method: 'POST', body: JSON.stringify({ name: title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [parentId] }) });
      return r.id;
    },
    async writeSheets(a, id, tables: SheetTable[]) {
      type Props = { sheetId: number; title: string };
      const meta = await call<{ sheets: { properties: Props }[] }>(a, sheetsUrl(id, '?fields=sheets.properties(sheetId,title)'));
      let sheets = meta.sheets.map((s) => s.properties);
      const requests: unknown[] = [];
      const missing = tables.filter((t) => !sheets.some((s) => s.title === t.title));
      // Spreadsheet baru berisi satu lembar kosong bawaan ("Sheet1"/"Lembar1"): pakai untuk lembar pertama.
      const blank = sheets.length === 1 && /^(Sheet|Lembar|Sheet )1$/.test(sheets[0].title) ? sheets[0] : null;
      missing.forEach((t, i) => {
        if (i === 0 && blank) requests.push({ updateSheetProperties: { properties: { sheetId: blank.sheetId, title: t.title }, fields: 'title' } });
        else requests.push({ addSheet: { properties: { title: t.title } } });
      });
      if (requests.length) {
        await call(a, sheetsUrl(id, ':batchUpdate'), { method: 'POST', body: JSON.stringify({ requests }) });
        sheets = (await call<{ sheets: { properties: Props }[] }>(a, sheetsUrl(id, '?fields=sheets.properties(sheetId,title)'))).sheets.map((s) => s.properties);
      }
      const range = (t: string) => `'${t.replace(/'/g, "''")}'`;
      await call(a, sheetsUrl(id, '/values:batchClear'), { method: 'POST', body: JSON.stringify({ ranges: tables.map((t) => range(t.title)) }) });
      await call(a, sheetsUrl(id, '/values:batchUpdate'), {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: tables.map((t) => ({ range: `${range(t.title)}!A1`, values: [t.columns, ...t.rows.map((r) => r.map((c) => (c == null ? '' : typeof c === 'number' ? c : String(c))))] })),
        }),
      });
      // Judul kolom navy bertulisan putih, baris judul dibekukan, saringan aktif, lebar kolom menyesuaikan isi.
      const fmt = tables.flatMap((t) => {
        const sheetId = sheets.find((s) => s.title === t.title)!.sheetId;
        const cols = Math.max(t.columns.length, 1);
        return [
          { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols }, cell: { userEnteredFormat: { backgroundColor: { red: 0.118, green: 0.122, blue: 0.31 }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)' } },
          { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
          { setBasicFilter: { filter: { range: { sheetId, startRowIndex: 0, endRowIndex: t.rows.length + 1, startColumnIndex: 0, endColumnIndex: cols } } } },
          { autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: cols } } },
        ];
      });
      await call(a, sheetsUrl(id, ':batchUpdate'), { method: 'POST', body: JSON.stringify({ requests: fmt }) });
    },
    spreadsheetUrl: (id) => `https://docs.google.com/spreadsheets/d/${id}/edit`,
  };
}
