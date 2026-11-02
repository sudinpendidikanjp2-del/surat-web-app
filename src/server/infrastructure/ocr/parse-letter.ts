/**
 * Penguraian teks hasil OCR surat masuk menjadi field formulir.
 * Fungsi murni tanpa dependensi sehingga mudah diuji. Setiap field membawa kepercayaan (0 sampai 100)
 * dari rata-rata kepercayaan kata pada baris sumbernya.
 */

const BULAN = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const BULAN_ALIAS: Record<string, number> = { pebruari: 2, nopember: 11, agustus: 8, agt: 8, agu: 8 };
const SIFAT = ['Biasa', 'Segera', 'Penting', 'Rahasia'];
const JABATAN = /^(plt\.?\s+|plh\.?\s+|a\.?n\.?\s+)?(kepala|ketua|direktur|camat|lurah|sekretaris|wakil|bendahara|rektor|dekan|pimpinan|manajer|koordinator|wali|pengurus|penanggung)/i;

/** Satu baris hasil OCR. y dan x untuk mengurutkan dari atas ke bawah. */
export interface Line { text: string; conf: number; y?: number; x?: number }
export interface ParsedField { value: string; conf: number; review?: boolean }

export function lev(a: string, b: string): number {
  const m = a.length; const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur: number[] = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Perbaiki salah baca huruf menjadi angka pada token yang sebagian besar angka (mis. 4Z1 menjadi 421). */
function fixDigits(token: string) {
  const digits = (token.match(/\d/g) || []).length;
  if (digits < 2 || digits < token.replace(/[^A-Za-z0-9]/g, '').length / 2) return token;
  const map: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', '|': '1', S: '5', B: '8', Z: '2' };
  return token.replace(/[OolI|SBZ]/g, (c, i, s) => {
    const around = `${s[i - 1] || ''}${s[i + 1] || ''}`;
    return /\d/.test(around) ? map[c] : c;
  });
}

export function monthFrom(word: string): number | null {
  const w = word.toLowerCase().replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/[^a-z]/g, '');
  if (!w) return null;
  if (BULAN_ALIAS[w]) return BULAN_ALIAS[w];
  let best: { d: number; m: number } | null = null;
  for (let i = 0; i < 12; i++) {
    const d = lev(w, BULAN[i]);
    if (d <= (BULAN[i].length <= 4 ? 1 : 2) && (!best || d < best.d)) best = { d, m: i + 1 };
  }
  return best ? best.m : null;
}

export function parseDate(text: string): string | null {
  const re = /(\d{1,2})\s*([A-Za-z015]{3,10})\.?\s*(\d[\dOolIS]{3})/g;
  for (const m of text.matchAll(re)) {
    const mon = monthFrom(m[2]);
    if (!mon) continue;
    const year = Number(fixDigits(m[3]).replace(/[^0-9]/g, ''));
    const day = Number(fixDigits(m[1]));
    if (year < 1990 || year > 2100 || day < 1 || day > 31) continue;
    return `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/** Ambang keyakinan di bawah mana isian diminta diperiksa. Angka dan tanggal lebih ketat karena salah satu digit mengubah artinya. */
const REVIEW_BELOW: Record<string, number> = { no_surat: 92, tgl_surat: 90, lampiran: 88 };
export const needsReview = (field: string, conf: number) => conf < (REVIEW_BELOW[field] ?? 85);

/** Cocokkan kata ke sifat surat baku (Biasa, Segera, Penting, Rahasia). Mengembalikan null bila terlalu jauh. */
export function normalizeSifat(word: string): string | null {
  const w = String(word || '').split(' ')[0].replace(/[^A-Za-z]/g, '').toLowerCase();
  if (!w) return null;
  const best = SIFAT.map((x) => ({ x, d: lev(w, x.toLowerCase()) })).sort((a, b) => a.d - b.d)[0];
  return best.d <= 2 ? best.x : null;
}

const KEY = {
  nomor: /^\s*(nomor|nomer|no)\s*[:;.,]?\s*(.*)$/i,
  sifat: /^\s*(sifat|sitat)\s*[:;.,]?\s*(.*)$/i,
  lampiran: /^\s*(lampiran|lamp|lamplran)\s*[:;.,]?\s*(.*)$/i,
  perihal: /^\s*(perihal|prihal|perihai|hal)\s*[:;.,]\s*(.*)$/i,
};
const STOP = /^\s*(yth|yang terhormat|kepada|di\s*$|dengan hormat|sehubungan|bersama ini|nomor|sifat|lampiran|jakarta\b)/i;

const ROMAWI = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Segmen nomor yang hanya terdiri dari I, V, X, l, 1, | adalah angka romawi bulan. Cocokkan ke romawi 1 sampai 12 terdekat. */
function fixRoman(token: string) {
  const parts = token.split('/');
  return parts.map((seg, i) => {
    // Segmen tepat sebelum tahun (mis. .../X/2026) adalah bulan romawi; "111" di sana berarti III.
    const beforeYear = i === parts.length - 2 && /^(19|20)\d\d$/.test(parts[parts.length - 1]);
    if (!/^[IVXl1|]{1,5}$/.test(seg) || (/^\d+$/.test(seg) && !beforeYear)) return seg;
    const norm = seg.replace(/[l1|]/g, 'I');
    const best = ROMAWI.map((r) => ({ r, d: lev(norm, r) })).sort((a, b) => a.d - b.d)[0];
    return best.d <= 2 ? best.r : seg;
  }).join('/');
}

export function cleanNomor(v: string) {
  const t = squash(v)
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*-\s*/g, '-')
    .split(' ').map(fixDigits).join(' ')
    .replace(/[.,;:]+$/, '');
  return fixRoman(t);
}

/**
 * lines: [{ text, conf }] berurutan dari atas ke bawah.
 * Mengembalikan { fields: { nama: { value, conf } }, missing: [nama] }.
 */
export function parseLetter(lines: Line[]): { fields: Record<string, ParsedField>; missing: string[] } {
  const L = lines.map((l) => ({ text: squash(l.text || ''), conf: l.conf ?? 0 })).filter((l) => l.text);
  const fields: Record<string, ParsedField> = {};
  const put = (k: string, value: string | null | undefined, conf: number) => { if (value != null && value !== '') fields[k] = { value, conf: Math.round(conf), review: conf < (REVIEW_BELOW[k] ?? 85) }; };
  const bodyStart = L.findIndex((l) => /^(yth|yang terhormat|kepada)/i.test(l.text));
  const head = L.slice(0, bodyStart > 0 ? bodyStart : Math.min(L.length, 30));

  let iNomor = -1;
  head.forEach((l, i) => {
    const m = l.text.match(KEY.nomor);
    if (m && iNomor < 0 && m[2]) { iNomor = i; put('no_surat', cleanNomor(m[2]), l.conf); }
  });

  // tanggal surat: baris kota dan tanggal, di atas atau sekitar blok nomor
  const around = L.slice(Math.max(0, iNomor - 3), (bodyStart > 0 ? bodyStart : 25) + 1);
  for (const l of around) {
    const d = parseDate(l.text);
    if (d) { put('tgl_surat', d, l.conf); break; }
  }
  if (!fields.tgl_surat) for (const l of L.slice(0, 30)) { const d = parseDate(l.text); if (d) { put('tgl_surat', d, l.conf * 0.8); break; } }

  head.forEach((l) => {
    const s = l.text.match(KEY.sifat);
    if (s && s[2] && !fields.sifat) {
      const w = s[2].split(' ')[0].replace(/[^A-Za-z]/g, '');
      const best = SIFAT.map((x) => ({ x, d: lev(w.toLowerCase(), x.toLowerCase()) })).sort((a, b) => a.d - b.d)[0];
      if (best && best.d <= 2) put('sifat', best.x, l.conf * (best.d === 0 ? 1 : 0.8));
    }
    const lp = l.text.match(KEY.lampiran);
    if (lp && lp[2] !== undefined && !fields.lampiran) {
      let v = lp[2].replace(/^[-–_.]\s*$/, '').replace(/[.,;:]+$/, '');
      v = v.replace(/(\d)([A-Za-z])/g, '$1 $2');
      if (v.length <= 2 && !/\d/.test(v)) v = '';
      put('lampiran', v, l.conf);
      if (!v) fields.lampiran = { value: '', conf: Math.round(l.conf) };
    }
  });

  const pi = head.findIndex((l) => KEY.perihal.test(l.text));
  if (pi >= 0) {
    const m = head[pi].text.match(KEY.perihal);
    let value = m![2];
    const confs = [head[pi].conf];
    for (let j = pi + 1; j < head.length; j++) {
      const t = head[j].text;
      if (STOP.test(t) || /^[A-Za-z .]{1,14}\s*[:;]/.test(t) || parseDate(t)) break;
      value += ` ${t}`;
      confs.push(head[j].conf);
    }
    put('perihal', squash(value).replace(/[.,;:]+$/, ''), avg(confs));
  }

  // Cadangan tanpa label: label ("Nomor", "Perihal", ...) sering hilang atau rusak pada foto, nilainya yang masih terbaca.
  const strip = (t: string) => t.replace(/^[\s:;.,|]+/, '').trim();
  if (!fields.no_surat) {
    const l = head.find((x) => (strip(x.text).match(/\//g) || []).length >= 2 && /\d/.test(x.text) && !parseDate(x.text) && x.text.length < 80);
    if (l) put('no_surat', cleanNomor(strip(l.text)), l.conf * 0.9);
  }
  if (!fields.sifat) {
    for (const l of head) {
      const w = strip(l.text);
      if (w.length > 9 || w.length < 4) continue;
      const best = SIFAT.map((x) => ({ x, d: lev(w.toLowerCase(), x.toLowerCase()) })).sort((a, b) => a.d - b.d)[0];
      if (best.d <= 1) { put('sifat', best.x, l.conf * 0.9); break; }
    }
  }
  if (fields.lampiran === undefined) {
    const l = head.find((x) => /^\s*[:;.]?\s*(\d+\s*(\([^)]*\))?\s*(berkas|lembar|bendel|eksemplar|buah|set|map|pcs))/i.test(x.text));
    if (l) put('lampiran', strip(l.text), l.conf * 0.9);
  }
  if (!fields.perihal && bodyStart > 0) {
    for (let j = bodyStart - 1; j >= Math.max(0, bodyStart - 3); j--) {
      const t = head.length > j ? L[j].text : '';
      if (!t || parseDate(t) || /^(nomor|sifat|lampiran)/i.test(strip(t)) || fields.no_surat?.value === cleanNomor(strip(t))) continue;
      if (strip(t).length >= 12) { put('perihal', strip(t).replace(/[.,;:]+$/, ''), L[j].conf * 0.85); break; }
    }
  }

  // kop: baris huruf kapital di bagian paling atas; instansi = baris kapital terakhir sebelum alamat
  const top = L.slice(0, 8);
  const addrIdx = top.findIndex((l) => /\b(jl\.?|jalan)\b/i.test(l.text));
  const kopLines = (addrIdx > 0 ? top.slice(0, addrIdx) : top.slice(0, 3)).filter((l) => {
    const letters = l.text.replace(/[^A-Za-z]/g, '');
    return letters.length >= 4 && (l.text.replace(/[^A-Z]/g, '').length / letters.length) >= 0.7;
  });
  if (kopLines.length) {
    const k = kopLines[kopLines.length - 1];
    put('instansi', k.text, k.conf);
  }
  if (addrIdx >= 0) {
    const a = top[addrIdx];
    put('alamat', a.text.replace(/\s*(telp|tel|telepon|hp|email|e-mail|website|fax)\b.*$/i, '').replace(/[.,;]+$/, ''), a.conf);
  }

  // pengirim: jabatan penanda tangan di blok akhir
  const tail = L.slice(-9);
  const j = tail.find((l) => JABATAN.test(l.text) && l.text.length < 60);
  if (j) put('asal', j.text.replace(/[,;.]+$/, ''), j.conf);
  else if (fields.instansi) put('asal', fields.instansi.value, fields.instansi.conf * 0.6);

  put('perihal_default', '', 0);
  delete fields.perihal_default;
  const required = ['no_surat', 'tgl_surat', 'asal', 'perihal'];
  return { fields, missing: required.filter((k) => !fields[k]) };
}
