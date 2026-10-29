import { parseDocument } from 'htmlparser2';
import type { ChildNode, Element } from 'domhandler';
import { isRichHtml } from '@/domain/rich-text';

/**
 * Ubah HTML dari editor isi surat menjadi XML Word (OOXML).
 * Hanya bentuk yang dikenal yang dikeluarkan: paragraf, judul, daftar, kutipan, tabel, garis, dan tanda
 * tebal/miring/garis bawah/coret. Tag lain diabaikan tetapi teksnya tetap ikut, jadi HTML apa pun aman untuk DOCX.
 * Paragraf mewarisi pengaturan paragraf (pPr) dan huruf (rPr) dari tempat placeholder di template.
 */

interface Marks { b?: boolean; i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean }
interface Base { pPr: string; rPr: string; width: number }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const isEl = (n: ChildNode): n is Element => n.type === 'tag';
const BLOCK = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'blockquote', 'hr', 'div']);

const alignOf = (el: Element) => {
  const m = /text-align:\s*(left|right|center|justify)/i.exec(el.attribs.style || '');
  return m ? ({ left: 'left', right: 'right', center: 'center', justify: 'both' } as const)[m[1].toLowerCase() as 'left'] : null;
};

const pick = (xml: string, tag: string) => new RegExp(`<w:${tag}(?: [^>]*)?/>`).exec(xml)?.[0] ?? '';
const on = (xml: string, tag: string) => { const t = pick(xml, tag); return !!t && !/w:val="(0|false)"/.test(t); };

/** rPr baru dari rPr placeholder ditambah tanda, dalam urutan skema CT_RPr agar Word dan LibreOffice menerimanya. */
function rPr(base: string, m: Marks, size?: number) {
  const b = m.b || on(base, 'b');
  const i = m.i || on(base, 'i');
  const sz = size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : pick(base, 'sz') + pick(base, 'szCs');
  const vert = m.sup || m.sub ? `<w:vertAlign w:val="${m.sup ? 'superscript' : 'subscript'}"/>` : '';
  const inner = `${pick(base, 'rFonts')}${b ? '<w:b/><w:bCs/>' : ''}${i ? '<w:i/><w:iCs/>' : ''}${pick(base, 'caps')}${m.s ? '<w:strike/>' : ''}${pick(base, 'color')}${sz}${m.u ? '<w:u w:val="single"/>' : pick(base, 'u')}${vert}${pick(base, 'lang')}`;
  return inner ? `<w:rPr>${inner}</w:rPr>` : '';
}

/** Run teks dari simpul inline. */
function runs(nodes: ChildNode[], base: Base, m: Marks, size?: number): string {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') {
      const t = n.data.replace(/\s+/g, ' ');
      if (t) out += `<w:r>${rPr(base.rPr, m, size)}<w:t xml:space="preserve">${esc(decodeText(t))}</w:t></w:r>`;
    } else if (isEl(n)) {
      const tag = n.name.toLowerCase();
      if (tag === 'br') { out += `<w:r>${rPr(base.rPr, m, size)}<w:br/></w:r>`; continue; }
      const next: Marks = { ...m };
      if (tag === 'strong' || tag === 'b') next.b = true;
      if (tag === 'em' || tag === 'i') next.i = true;
      if (tag === 'u') next.u = true;
      if (tag === 's' || tag === 'strike' || tag === 'del') next.s = true;
      if (tag === 'sup') next.sup = true;
      if (tag === 'sub') next.sub = true;
      out += runs(n.children, base, next, size);
    }
  }
  return out;
}

/** htmlparser2 dengan decodeEntities sudah menerjemahkan entitas; fungsi ini menjaga sisa nbsp. */
const decodeText = (t: string) => t.replace(/ /g, ' ');

/**
 * pPr baru dari pPr placeholder: gaya, jarak, indentasi, dan perataan diwarisi; tab dan garis tepi tidak
 * (keduanya milik baris placeholder, bukan isi). Urutan elemen mengikuti skema CT_PPr.
 */
function pPr(base: string, o: { jc?: string | null; left?: number; hanging?: number; after?: number; cell?: boolean; tabAt?: number; rule?: boolean }) {
  const baseLeft = o.cell ? 0 : Number(/<w:ind [^>]*w:left="(\d+)"/.exec(base)?.[1] || 0);
  const spacing = o.after !== undefined ? `<w:spacing w:before="0" w:after="${o.after}"/>` : pick(base, 'spacing');
  const ind = o.left !== undefined ? `<w:ind w:left="${baseLeft + o.left}"${o.hanging ? ` w:hanging="${o.hanging}"` : ''}/>` : o.cell ? '' : pick(base, 'ind');
  const jc = o.jc ? `<w:jc w:val="${o.jc}"/>` : pick(base, 'jc');
  const bdr = o.rule ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/></w:pBdr>' : '';
  const tabs = o.tabAt !== undefined ? `<w:tabs><w:tab w:val="left" w:pos="${baseLeft + o.tabAt}"/></w:tabs>` : '';
  return `<w:pPr>${o.cell ? '' : pick(base, 'pStyle')}${bdr}${tabs}${spacing}${ind}${jc}</w:pPr>`;
}

const HEADING_SIZE: Record<string, number> = { h1: 32, h2: 28, h3: 26, h4: 24, h5: 24, h6: 24 };

function paragraph(el: Element, base: Base, extra: { left?: number; hanging?: number; prefix?: string; cell?: boolean; m?: Marks } = {}) {
  const tag = el.name.toLowerCase();
  const heading = HEADING_SIZE[tag];
  const m: Marks = { ...extra.m, ...(heading ? { b: true } : {}) };
  const jc = alignOf(el) ?? (heading ? 'left' : extra.cell ? 'left' : null);
  const prefix = extra.prefix ? `<w:r>${rPr(base.rPr, m, heading)}<w:t xml:space="preserve">${esc(extra.prefix)}</w:t></w:r><w:r>${rPr(base.rPr, m, heading)}<w:tab/></w:r>` : '';
  const props = pPr(base.pPr, {
    jc, left: extra.left, hanging: extra.hanging, cell: extra.cell, tabAt: extra.prefix ? extra.left : undefined,
    ...(extra.cell ? { after: 0 } : heading ? { after: 120 } : {}),
  });
  return `<w:p>${props}${prefix}${runs(el.children, base, m, heading)}</w:p>`;
}

/** Bagi simpul campuran menjadi blok: teks inline yang berdampingan dibungkus menjadi satu paragraf. */
function blocks(nodes: ChildNode[], base: Base, ctx: { left?: number; cell?: boolean; m?: Marks }): string {
  let out = '';
  let inline: ChildNode[] = [];
  const flush = () => {
    if (inline.some((n) => (n.type === 'text' ? n.data.trim() : isEl(n)))) {
      out += paragraph({ name: 'p', attribs: {}, children: inline } as unknown as Element, base, ctx);
    }
    inline = [];
  };
  for (const n of nodes) {
    if (!isEl(n) || !BLOCK.has(n.name.toLowerCase())) { inline.push(n); continue; }
    flush();
    const tag = n.name.toLowerCase();
    if (tag === 'ul' || tag === 'ol') out += list(n, base, ctx, 0);
    else if (tag === 'table') out += table(n, base);
    else if (tag === 'hr') out += `<w:p>${pPr(base.pPr, { after: 120, rule: true })}</w:p>`;
    else if (tag === 'blockquote') out += blocks(n.children, base, { ...ctx, left: (ctx.left ?? 0) + 720, m: { ...ctx.m, i: true } });
    else if (tag === 'div' || tag === 'li') out += blocks(n.children, base, ctx);
    else out += paragraph(n, base, ctx);
  }
  flush();
  return out;
}

function list(el: Element, base: Base, ctx: { left?: number; cell?: boolean; m?: Marks }, depth: number): string {
  const ordered = el.name.toLowerCase() === 'ol';
  const start = Number(el.attribs.start || 1);
  const indent = (ctx.left ?? 0) + (depth ? 360 : 0);
  let out = '';
  let i = 0;
  for (const li of el.children.filter(isEl)) {
    if (li.name.toLowerCase() !== 'li') continue;
    const prefix = ordered ? `${start + i}.` : depth % 2 ? '–' : '•';
    i++;
    let first = true;
    for (const part of li.children) {
      if (isEl(part) && (part.name === 'ul' || part.name === 'ol')) { out += list(part, base, { ...ctx, left: indent }, depth + 1); continue; }
      const wrap = isEl(part) && BLOCK.has(part.name.toLowerCase()) ? part : ({ name: 'p', attribs: {}, children: [part] } as unknown as Element);
      if (!isEl(part) && part.type === 'text' && !part.data.trim()) continue;
      out += paragraph(wrap, base, { ...ctx, left: indent + 360, hanging: first ? 360 : undefined, prefix: first ? prefix : undefined });
      first = false;
    }
    if (first) out += paragraph({ name: 'p', attribs: {}, children: [] } as unknown as Element, base, { ...ctx, left: indent + 360, hanging: 360, prefix });
  }
  return out;
}

function table(el: Element, base: Base): string {
  const rows: Element[] = [];
  const collect = (n: Element) => {
    for (const c of n.children.filter(isEl)) {
      const t = c.name.toLowerCase();
      if (t === 'tr') rows.push(c);
      else if (t === 'thead' || t === 'tbody' || t === 'tfoot') collect(c);
    }
  };
  collect(el);
  if (!rows.length) return '';
  const cellsOf = (r: Element) => r.children.filter(isEl).filter((c) => /^t[dh]$/i.test(c.name));
  const cols = Math.max(...rows.map((r) => cellsOf(r).reduce((s, c) => s + Math.max(1, Number(c.attribs.colspan || 1)), 0)), 1);
  // Lebar kolom dari editor (colwidth dalam piksel) bila ada, selain itu dibagi rata.
  const firstWidths: number[] = [];
  for (const c of cellsOf(rows[0])) {
    const span = Math.max(1, Number(c.attribs.colspan || 1));
    const ws = String(c.attribs.colwidth || '').split(',').map(Number).filter((n) => n > 0);
    for (let k = 0; k < span; k++) firstWidths.push(ws[k] || 0);
  }
  const known = firstWidths.filter(Boolean);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const px = Array.from({ length: cols }, (_, k) => firstWidths[k] || fallback);
  const total = px.reduce((a, b) => a + b, 0);
  const grid = px.map((w) => Math.max(400, Math.round((w / total) * base.width)));
  const border = (side: string) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${grid.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  // Sel yang digabung ke bawah (rowspan) dilanjutkan dengan vMerge di baris berikutnya.
  const carry: number[] = new Array(cols).fill(0);
  const carrySpan: number[] = new Array(cols).fill(1);
  let body = '';
  for (const r of rows) {
    let col = 0;
    let tr = '';
    const cells = cellsOf(r);
    const header = cells.length > 0 && cells.every((c) => c.name.toLowerCase() === 'th');
    const emitContinue = () => {
      while (col < cols && carry[col] > 0) {
        const span = carrySpan[col];
        const w = grid.slice(col, col + span).reduce((a, b) => a + b, 0);
        tr += `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
        for (let k = 0; k < span; k++) carry[col + k]--;
        col += span;
      }
    };
    for (const c of cells) {
      emitContinue();
      if (col >= cols) break;
      const span = Math.min(Math.max(1, Number(c.attribs.colspan || 1)), cols - col);
      const rowspan = Math.max(1, Number(c.attribs.rowspan || 1));
      const w = grid.slice(col, col + span).reduce((a, b) => a + b, 0);
      const th = c.name.toLowerCase() === 'th';
      const tcPr = `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${rowspan > 1 ? '<w:vMerge w:val="restart"/>' : ''}${th ? '<w:shd w:val="clear" w:color="auto" w:fill="E7E8EF"/>' : ''}</w:tcPr>`;
      const content = blocks(c.children, base, { cell: true, m: th ? { b: true } : {} });
      tr += `<w:tc>${tcPr}${content || '<w:p/>'}</w:tc>`;
      if (rowspan > 1) for (let k = 0; k < span; k++) { carry[col + k] = rowspan - 1; carrySpan[col] = span; }
      col += span;
    }
    emitContinue();
    // Sel kosong di ujung baris yang lebih pendek agar grid tetap utuh.
    while (col < cols) { tr += `<w:tc><w:tcPr><w:tcW w:w="${grid[col]}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`; col++; }
    body += `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${tr}</w:tr>`;
  }
  // Paragraf kosong sesudah tabel: Word tidak mengizinkan dua tabel berdempetan dan memberi jarak dari teks berikutnya.
  return `<w:tbl>${tblPr}<w:tblGrid>${grid.map((g) => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${body}</w:tbl><w:p>${pPr(base.pPr, { after: 0 })}</w:p>`;
}

/** Teks biasa (nilai lama atau isian satu baris): satu paragraf per baris. */
function plainBlocks(text: string, base: Base) {
  return text.split(/\r?\n/).map((line) => `<w:p>${base.pPr}<w:r>${base.rPr}<w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`).join('');
}

/** XML blok (pengganti seluruh paragraf placeholder). */
export function richToBlocks(value: string, base: Base) {
  if (!isRichHtml(value)) return plainBlocks(value, base);
  const doc = parseDocument(value, { decodeEntities: true });
  return blocks(doc.children, base, {}) || `<w:p>${base.pPr}</w:p>`;
}

/** XML run (placeholder berada di tengah kalimat): blok diratakan menjadi baris, tabel menjadi sel dipisah tab. */
export function richToRuns(value: string, rPrBase: string) {
  const base: Base = { pPr: '', rPr: rPrBase, width: 9000 };
  if (!isRichHtml(value)) {
    return value.split(/\r?\n/).map((l, i) => `${i ? `<w:r>${rPrBase}<w:br/></w:r>` : ''}<w:r>${rPrBase}<w:t xml:space="preserve">${esc(l)}</w:t></w:r>`).join('');
  }
  const doc = parseDocument(value, { decodeEntities: true });
  const lines: string[] = [];
  const walk = (nodes: ChildNode[], m: Marks) => {
    for (const n of nodes) {
      if (!isEl(n)) continue;
      const tag = n.name.toLowerCase();
      if (tag === 'tr') { lines.push(n.children.filter(isEl).map((c) => runs(c.children.flatMap((x) => (isEl(x) ? x.children : [x])), base, m)).join(`<w:r>${rPrBase}<w:tab/></w:r>`)); continue; }
      if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) { lines.push(runs(n.children, base, m)); continue; }
      walk(n.children, m);
    }
  };
  walk(doc.children, {});
  return lines.join(`<w:r>${rPrBase}<w:br/></w:r>`);
}

/** Lebar area tulis halaman (twip) dari sectPr dokumen; bawaan A4 dengan margin 2,5 cm. */
export function textWidth(documentXml: string) {
  const w = Number(/<w:pgSz [^>]*w:w="(\d+)"/.exec(documentXml)?.[1] || 11906);
  const l = Number(/<w:pgMar [^>]*w:left="(\d+)"/.exec(documentXml)?.[1] || 1418);
  const r = Number(/<w:pgMar [^>]*w:right="(\d+)"/.exec(documentXml)?.[1] || 1418);
  return Math.max(3000, w - l - r);
}
