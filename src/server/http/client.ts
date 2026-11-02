import { isIP } from 'node:net';

/**
 * Identitas klien dari permintaan. Fungsi murni agar dapat diuji tanpa server.
 *
 * Header proxy (X-Real-IP, X-Forwarded-For, X-Forwarded-Proto/Host) dapat diisi siapa saja yang tersambung
 * langsung ke aplikasi, jadi hanya dipercaya bila TRUST_PROXY=true, yaitu aplikasi berada di belakang reverse
 * proxy yang menimpa atau menambahkan header itu dan tidak dapat dijangkau langsung dari luar.
 */
interface HeaderBag { get(name: string): string | null }

/** IP klien, atau null bila tidak diketahui. Nilai yang bukan alamat IP dibuang agar tidak masuk ke log. */
export function clientIp(headers: HeaderBag, trustProxy: boolean): string | null {
  if (!trustProxy) return null;
  const candidates = [
    headers.get('x-real-ip'),
    // Entri paling kanan ditambahkan proxy terdekat; entri di kirinya dapat dipalsukan klien.
    headers.get('x-forwarded-for')?.split(',').at(-1),
  ];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (v && isIP(v) !== 0) return v;
  }
  return null;
}

/**
 * Alamat dasar untuk tautan yang dibagikan (QR, pelacakan, alamat balik OAuth). APP_URL bila diisi; selain itu
 * dari Host permintaan, dan dari X-Forwarded-Proto/Host hanya bila proxy dipercaya.
 */
export function baseUrl(headers: HeaderBag, requestUrl: URL, opts: { appUrl: string; trustProxy: boolean }): string {
  if (opts.appUrl) return opts.appUrl;
  const fwd = (name: string) => (opts.trustProxy ? headers.get(name)?.split(',')[0].trim() : undefined);
  const proto = fwd('x-forwarded-proto') || requestUrl.protocol.replace(':', '');
  const host = fwd('x-forwarded-host') || headers.get('host') || requestUrl.host;
  return `${proto === 'https' ? 'https' : 'http'}://${host}`;
}

/** Permintaan datang lewat HTTPS (langsung, atau lewat proxy tepercaya). Menentukan atribut Secure pada cookie. */
export function isHttps(headers: HeaderBag, requestUrl: URL, opts: { appUrl: string; trustProxy: boolean }): boolean {
  return baseUrl(headers, requestUrl, opts).startsWith('https://');
}
