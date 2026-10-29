import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';

/**
 * Server Google tiruan untuk uji: token OAuth/JWT, Drive v3 (folder, unggah multipart dan bersambung, unduh,
 * daftar), dan Sheets v4 (lembar, isi, format). Hanya perilaku yang dipakai aplikasi.
 */
export interface FakeFile { id: string; name: string; mimeType: string; parents: string[]; body: Buffer; modifiedTime: string }

export async function startFakeGoogle() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceJson = JSON.stringify({
    type: 'service_account', client_email: 'surat-sync@contoh-proyek.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
  const files = new Map<string, FakeFile>();
  const sheets = new Map<string, { sheets: { sheetId: number; title: string }[]; values: Record<string, unknown[][]>; formats: unknown[] }>();
  const sessions = new Map<string, { name: string; parents: string[]; mime: string }>();
  const SHARED = 'SharedFolder_0123456789';
  files.set(SHARED, { id: SHARED, name: 'Arsip Kantor', mimeType: 'application/vnd.google-apps.folder', parents: [], body: Buffer.alloc(0), modifiedTime: new Date().toISOString() });
  let seq = 0;
  const newId = (p: string) => `${p}${String(++seq).padStart(6, '0')}abcdef`;
  const calls: string[] = [];

  const read = (req: http.IncomingMessage) => new Promise<Buffer>((resolve) => { const c: Buffer[] = []; req.on('data', (d) => c.push(d)); req.on('end', () => resolve(Buffer.concat(c))); });
  const send = (res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
  };
  const meta = (f: FakeFile) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.body.length), modifiedTime: f.modifiedTime, webViewLink: `https://drive.google.com/file/d/${f.id}/view` });

  /** Pengurai kueri Drive yang cukup untuk bentuk kueri aplikasi. */
  function query(q: string) {
    const name = /name='((?:\\'|[^'])*)'/.exec(q)?.[1]?.replace(/\\'/g, "'");
    const contains = /name contains '((?:\\'|[^'])*)'/.exec(q)?.[1];
    const parent = /'([^']+)' in parents/.exec(q)?.[1];
    const folderOnly = q.includes("mimeType='application/vnd.google-apps.folder'");
    return [...files.values()].filter((f) =>
      (!name || q.includes('name contains') || f.name === name) && (!contains || f.name.includes(contains)) &&
      (!parent || f.parents.includes(parent)) && (!folderOnly || f.mimeType === 'application/vnd.google-apps.folder'));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const p = url.pathname;
    calls.push(`${req.method} ${p}`);
    const body = await read(req);
    if (p === '/token') {
      const f = new URLSearchParams(body.toString());
      const g = f.get('grant_type');
      if (g === 'urn:ietf:params:oauth:grant-type:jwt-bearer') {
        const [h, c, s] = String(f.get('assertion')).split('.');
        const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url'));
        return ok ? send(res, 200, { access_token: 'tok-service', expires_in: 3600 }) : send(res, 400, { error: 'invalid_grant' });
      }
      if (g === 'refresh_token') return f.get('refresh_token') === 'refresh-baik' ? send(res, 200, { access_token: 'tok-oauth', expires_in: 3600 }) : send(res, 400, { error: 'invalid_grant' });
      if (g === 'authorization_code') {
        if (f.get('code') !== 'kode-benar') return send(res, 400, { error: 'invalid_grant' });
        const idToken = `x.${Buffer.from(JSON.stringify({ email: 'tu.kantor@gmail.com' })).toString('base64url')}.y`;
        return send(res, 200, { access_token: 'tok-oauth', expires_in: 3600, refresh_token: 'refresh-baik', id_token: idToken });
      }
      return send(res, 400, { error: 'unsupported_grant_type' });
    }
    if (!/^Bearer tok-/.test(req.headers.authorization || '') && !p.startsWith('/upload-session/')) return send(res, 401, { error: { message: 'no auth' } });
    if (p === '/drive/v3/about') return send(res, 200, { user: { emailAddress: req.headers.authorization?.includes('service') ? 'surat-sync@contoh-proyek.iam.gserviceaccount.com' : 'tu.kantor@gmail.com' } });
    if (p === '/drive/v3/files' && req.method === 'GET') return send(res, 200, { files: query(url.searchParams.get('q') || '').map(meta) });
    if (p === '/drive/v3/files' && req.method === 'POST') {
      const m = JSON.parse(body.toString());
      if (m.parents?.some((x: string) => !files.has(x))) return send(res, 404, { error: { message: 'File not found' } });
      const id = newId(m.mimeType.includes('spreadsheet') ? 'Sheet' : 'Folder');
      files.set(id, { id, name: m.name, mimeType: m.mimeType, parents: m.parents || [], body: Buffer.alloc(0), modifiedTime: new Date().toISOString() });
      if (m.mimeType.includes('spreadsheet')) sheets.set(id, { sheets: [{ sheetId: 0, title: 'Sheet1' }], values: {}, formats: [] });
      return send(res, 200, { id });
    }
    let m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p);
    if (m) {
      const f = files.get(decodeURIComponent(m[1]));
      if (!f) return send(res, 404, { error: { message: 'File not found' } });
      if (req.method === 'DELETE') { files.delete(f.id); res.writeHead(204); return res.end(); }
      res.writeHead(200, { 'Content-Type': f.mimeType }); return res.end(f.body);
    }
    if (p === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart') {
      const boundary = /boundary=(.+)$/.exec(req.headers['content-type'] || '')![1];
      const parts = body.toString('latin1').split(`--${boundary}`);
      const metaPart = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const raw = parts[2].slice(parts[2].indexOf('\r\n\r\n') + 4, -2);
      const id = newId('File');
      const f = { id, name: metaPart.name, mimeType: /Content-Type: (.+)\r\n/.exec(parts[2])![1], parents: metaPart.parents, body: Buffer.from(raw, 'latin1'), modifiedTime: new Date().toISOString() };
      files.set(id, f);
      return send(res, 200, meta(f));
    }
    if (p === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'resumable') {
      const mm = JSON.parse(body.toString());
      const sid = crypto.randomUUID();
      sessions.set(sid, { name: mm.name, parents: mm.parents, mime: String(req.headers['x-upload-content-type']) });
      res.writeHead(200, { Location: `http://${req.headers.host}/upload-session/${sid}` });
      return res.end();
    }
    m = /^\/upload-session\/(.+)$/.exec(p);
    if (m) {
      const s = sessions.get(m[1])!;
      const id = newId('File');
      const f = { id, name: s.name, mimeType: s.mime, parents: s.parents, body, modifiedTime: new Date().toISOString() };
      files.set(id, f);
      return send(res, 200, meta(f));
    }
    m = /^\/v4\/spreadsheets\/([^/:]+)(.*)$/.exec(p);
    if (m) {
      const sh = sheets.get(decodeURIComponent(m[1]));
      if (!sh) return send(res, 404, { error: { message: 'Requested entity was not found.' } });
      const rest = m[2];
      if (req.method === 'GET') return send(res, 200, { sheets: sh.sheets.map((s) => ({ properties: s })) });
      const j = JSON.parse(body.toString());
      if (rest === ':batchUpdate') {
        for (const r of j.requests) {
          if (r.addSheet) sh.sheets.push({ sheetId: sh.sheets.length + 100, title: r.addSheet.properties.title });
          else if (r.updateSheetProperties?.fields === 'title') sh.sheets.find((s) => s.sheetId === r.updateSheetProperties.properties.sheetId)!.title = r.updateSheetProperties.properties.title;
          else sh.formats.push(r);
        }
        return send(res, 200, {});
      }
      if (rest === '/values:batchClear') { for (const r of j.ranges) delete sh.values[r]; return send(res, 200, {}); }
      if (rest === '/values:batchUpdate') { for (const d of j.data) sh.values[d.range.replace(/!A1$/, '')] = d.values; return send(res, 200, {}); }
    }
    send(res, 404, { error: { message: `tidak dikenal: ${req.method} ${p}` } });
  });
  const port = await new Promise<number>((resolve) => server.listen(0, () => resolve((server.address() as net.AddressInfo).port)));
  const base = `http://127.0.0.1:${port}`;
  /** Jalur folder sebuah file, misalnya "Arsip Kantor/Surat Masuk/2026/10 Oktober/AG-1 Perihal". */
  const pathOf = (f: FakeFile): string => {
    const parent = files.get(f.parents[0]);
    return parent ? `${pathOf(parent)}/${f.name}` : f.name;
  };
  return {
    base, files, sheets, calls, serviceJson, SHARED, pathOf,
    env: { GOOGLE_OAUTH_URL: base, GOOGLE_ACCOUNTS_URL: base, GOOGLE_API_URL: base, GOOGLE_SHEETS_URL: base },
    stop: () => new Promise<void>((r) => server.close(() => r())),
  };
}
