'use client';
import { useEffect } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import {
  AlignCenterIcon, AlignJustifyIcon, AlignLeftIcon, AlignRightIcon, BoldIcon, ItalicIcon, ListIcon, ListOrderedIcon,
  Redo2Icon, StrikethroughIcon, TableIcon, UnderlineIcon, Undo2Icon,
} from 'lucide-react';
import { isRichHtml } from '@/domain/rich-text';
import { cn } from '@/lib/utils';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Nilai lama berupa teks biasa dibuka sebagai paragraf per baris. */
const toHtml = (v: string) => (!v ? '' : isRichHtml(v) ? v : v.split(/\r?\n/).map((l) => `<p>${escapeHtml(l)}</p>`).join(''));

function Tool({ label, active, disabled, onClick, children, text }: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void; children?: React.ReactNode; text?: boolean;
}) {
  return (
    <button
      type="button" title={label} aria-label={text ? undefined : label} aria-pressed={active} disabled={disabled}
      // Tekan tanpa memindahkan fokus dari isi, agar pilihan teks tidak hilang.
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}
      className={cn(
        'pressable inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full text-sm font-semibold sm:h-9 disabled:cursor-default disabled:opacity-40 [&_svg]:size-4',
        text ? 'px-3' : 'w-11 sm:w-9',
        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

const Sep = () => <span aria-hidden className="mx-1 hidden h-6 w-px shrink-0 bg-border sm:block" />;

function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      left: e.isActive({ textAlign: 'left' }), center: e.isActive({ textAlign: 'center' }), right: e.isActive({ textAlign: 'right' }), justify: e.isActive({ textAlign: 'justify' }),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), table: e.isActive('table'),
      undo: e.can().undo(), redo: e.can().redo(), merge: e.can().mergeCells(), split: e.can().splitCell(),
    }),
  });
  const c = () => editor.chain().focus();
  return (
    <div className="border-b border-border">
      <div role="toolbar" aria-label="Format isi surat" className="flex flex-wrap items-center gap-0.5 p-1.5">
        <Tool label="Tebal" active={s.bold} onClick={() => c().toggleBold().run()}><BoldIcon aria-hidden /></Tool>
        <Tool label="Miring" active={s.italic} onClick={() => c().toggleItalic().run()}><ItalicIcon aria-hidden /></Tool>
        <Tool label="Garis bawah" active={s.underline} onClick={() => c().toggleUnderline().run()}><UnderlineIcon aria-hidden /></Tool>
        <Tool label="Coret" active={s.strike} onClick={() => c().toggleStrike().run()}><StrikethroughIcon aria-hidden /></Tool>
        <Sep />
        <Tool label="Rata kiri" active={s.left} onClick={() => c().setTextAlign('left').run()}><AlignLeftIcon aria-hidden /></Tool>
        <Tool label="Rata tengah" active={s.center} onClick={() => c().setTextAlign('center').run()}><AlignCenterIcon aria-hidden /></Tool>
        <Tool label="Rata kanan" active={s.right} onClick={() => c().setTextAlign('right').run()}><AlignRightIcon aria-hidden /></Tool>
        <Tool label="Rata kiri-kanan" active={s.justify} onClick={() => c().setTextAlign('justify').run()}><AlignJustifyIcon aria-hidden /></Tool>
        <Sep />
        <Tool label="Daftar berpoin" active={s.bullet} onClick={() => c().toggleBulletList().run()}><ListIcon aria-hidden /></Tool>
        <Tool label="Daftar bernomor" active={s.ordered} onClick={() => c().toggleOrderedList().run()}><ListOrderedIcon aria-hidden /></Tool>
        <Sep />
        <Tool text label="Sisipkan tabel" disabled={s.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <TableIcon aria-hidden /> Tabel
        </Tool>
        <span className="ml-auto flex">
          <Tool label="Urungkan" disabled={!s.undo} onClick={() => c().undo().run()}><Undo2Icon aria-hidden /></Tool>
          <Tool label="Ulangi" disabled={!s.redo} onClick={() => c().redo().run()}><Redo2Icon aria-hidden /></Tool>
        </span>
      </div>
      {s.table && (
        <div role="toolbar" aria-label="Atur tabel" className="flex flex-wrap items-center gap-0.5 border-t border-border bg-muted/60 p-1.5">
          <span className="px-2 text-xs font-semibold text-muted-foreground">Tabel:</span>
          <Tool text label="Tambah baris" onClick={() => c().addRowAfter().run()}>+ Baris</Tool>
          <Tool text label="Tambah kolom" onClick={() => c().addColumnAfter().run()}>+ Kolom</Tool>
          <Tool text label="Hapus baris" onClick={() => c().deleteRow().run()}>− Baris</Tool>
          <Tool text label="Hapus kolom" onClick={() => c().deleteColumn().run()}>− Kolom</Tool>
          <Tool text label="Gabung sel terpilih" disabled={!s.merge} onClick={() => c().mergeCells().run()}>Gabung sel</Tool>
          <Tool text label="Pisah sel" disabled={!s.split} onClick={() => c().splitCell().run()}>Pisah sel</Tool>
          <Tool text label="Jadikan baris judul" onClick={() => c().toggleHeaderRow().run()}>Baris judul</Tool>
          <Tool text label="Hapus tabel" onClick={() => c().deleteTable().run()}><span className="text-late">Hapus tabel</span></Tool>
        </div>
      )}
    </div>
  );
}

/**
 * Isian teks kaya untuk isi surat: paragraf, tebal/miring/garis bawah, perataan, daftar, dan tabel.
 * Nilai berupa HTML; server mengubahnya menjadi paragraf dan tabel Word sesuai gaya template.
 */
export function RichEditor({ id, value, onChange, label, invalid, describedBy, className }: {
  id: string; value: string; onChange: (html: string) => void; label: string; invalid?: boolean; describedBy?: string; className?: string;
}) {
  const attributes = {
    id, role: 'textbox', 'aria-multiline': 'true', 'aria-label': label,
    ...(invalid ? { 'aria-invalid': 'true' } : {}), ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    class: 'rich-content min-h-40 px-3.5 py-3 outline-none',
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, link: false, horizontalRule: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TableKit.configure({ table: { resizable: true, cellMinWidth: 48 } }),
    ],
    content: toHtml(value),
    editorProps: { attributes },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });
  // Galat dan petunjuk berubah setelah validasi; perbarui atribut tanpa membuat ulang editor.
  const attrKey = JSON.stringify(attributes);
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.setOptions({ editorProps: { attributes: JSON.parse(attrKey) } });
  }, [editor, attrKey]);
  return (
    <div
      data-invalid={invalid || undefined}
      className={cn(
        'min-w-0 overflow-hidden rounded-xl border border-input/60 bg-card transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/15 data-[invalid]:border-destructive',
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} /> : <div className="h-12 border-b border-border sm:h-12" aria-hidden />}
      <EditorContent editor={editor} />
    </div>
  );
}
