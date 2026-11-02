'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionDialog } from '@/components/app/action-dialog';
import { ChoiceRow, Choices, Field } from '@/components/app/form-field';
import { FilePicker } from '@/components/app/file-picker';
import { Loading } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import { METODE, PRIORITAS, PRIORITAS_DISPOSISI, SIFAT, TINDAKAN } from '@/domain/letter-in';
import { api } from '@/lib/api-client';
import { plusDays, todayIso } from '@/lib/format';
import { useRefValues } from '@/features/reference/api';
import { KEYS, useUnits, useUserOptions, type DispositionView, type LetterInDetail } from './api';

interface DialogProps { open: boolean; onOpenChange: (o: boolean) => void }
const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/* ---------- Disposisi ---------- */

export interface DisposeForm { to_user_ids: number[]; to_unit_ids: number[]; tindakan: string[]; instruksi: string; deadline: string; prioritas: string }
export const emptyDispose = (): DisposeForm => ({ to_user_ids: [], to_unit_ids: [], tindakan: ['Untuk ditindaklanjuti'], instruksi: '', deadline: plusDays(3), prioritas: 'Normal' });
export function checkDispose(f: DisposeForm) {
  if (f.to_user_ids.length + f.to_unit_ids.length === 0) return 'Pilih minimal satu penerima: unit kerja atau orang.';
  if (f.tindakan.length === 0) return 'Pilih minimal satu tindakan.';
  if (!f.instruksi.trim()) return 'Tulis instruksi untuk penerima.';
  return '';
}

/** Isian disposisi: kepada siapa, apa yang harus dilakukan, instruksinya, dan kapan harus selesai. */
export function DisposeFields({ f, setF, onlyStaff = false }: { f: DisposeForm; setF: (f: DisposeForm) => void; onlyStaff?: boolean }) {
  const me = useUser();
  const tindakanList = useRefValues('tindakan', TINDAKAN);
  const users = useUserOptions();
  const units = useUnits();
  const people = (users.data || []).filter((u) => u.id !== me.id && u.role !== 'viewer' && (!onlyStaff || ['pejabat', 'pelaksana'].includes(u.role)));
  return (
    <>
      <Choices legend="1. Kepada unit kerja" hint="Pejabat di unit itu yang akan menerima.">
        {units.isPending ? <Loading rows={1} /> : (units.data || []).filter((u) => u.aktif && u.kode !== 'PIM').map((u) => (
          <ChoiceRow key={u.id}><Checkbox checked={f.to_unit_ids.includes(u.id)} onCheckedChange={() => setF({ ...f, to_unit_ids: toggle(f.to_unit_ids, u.id) })} /><span className="font-semibold">{u.nama}</span></ChoiceRow>
        ))}
      </Choices>
      <Choices legend="Atau langsung kepada orang tertentu">
        {users.isPending ? <Loading rows={2} /> : people.map((u) => (
          <ChoiceRow key={u.id}>
            <Checkbox checked={f.to_user_ids.includes(u.id)} onCheckedChange={() => setF({ ...f, to_user_ids: toggle(f.to_user_ids, u.id) })} />
            <span><span className="font-semibold">{u.nama}</span><span className="block text-muted-foreground">{[u.jabatan, u.unit_nama].filter(Boolean).join(', ')}</span></span>
          </ChoiceRow>
        ))}
      </Choices>
      <Choices legend="2. Apa yang harus dilakukan">
        {tindakanList.map((t) => <ChoiceRow key={t}><Checkbox checked={f.tindakan.includes(t)} onCheckedChange={() => setF({ ...f, tindakan: toggle(f.tindakan, t) })} /><span>{t}</span></ChoiceRow>)}
      </Choices>
      <Field label="3. Instruksi" required hint="Tulis dengan kalimat yang jelas.">
        {(p) => <Textarea {...p} value={f.instruksi} onChange={(e) => setF({ ...f, instruksi: e.target.value })} placeholder="Contoh: Mohon disiapkan data peserta didik dan jawaban surat." />}
      </Field>
      <Field label="4. Harus selesai paling lambat" required>
        {(p) => <Input {...p} type="date" min={todayIso()} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}
      </Field>
      <Choices legend="5. Seberapa mendesak">
        <RadioGroup value={f.prioritas} onValueChange={(v) => setF({ ...f, prioritas: v })}>
          {PRIORITAS_DISPOSISI.map((p) => <ChoiceRow key={p}><RadioGroupItem value={p} /><span>{p}</span></ChoiceRow>)}
        </RadioGroup>
      </Choices>
    </>
  );
}

export function DisposeDialog({ letter, parent, ...o }: DialogProps & { letter: LetterInDetail['letter']; parent?: DispositionView }) {
  const [f, setF] = useState(emptyDispose());
  const [err, setErr] = useState('');
  const act = useAction(() => api.post(`/letters-in/${letter.id}/disposisi`, { ...f, parent_id: parent?.id }), {
    success: parent ? 'Disposisi sudah diteruskan.' : 'Disposisi sudah dikirim ke penerima.', keys: KEYS, onDone: () => o.onOpenChange(false),
  });
  return (
    <ActionDialog {...o} title={parent ? 'Teruskan disposisi' : 'Beri disposisi'} description={`${letter.no_agenda}: ${letter.perihal}`}
      error={err} confirmLabel={parent ? 'Teruskan Disposisi' : 'Kirim Disposisi'} pending={act.isPending}
      onConfirm={() => { const e = checkDispose(f); setErr(e); if (!e) act.mutate(); }}>
      <DisposeFields f={f} setF={setF} onlyStaff={Boolean(parent)} />
    </ActionDialog>
  );
}

export function ReturnDialog({ disp, ...o }: DialogProps & { disp: DispositionView }) {
  const [alasan, setAlasan] = useState('');
  const [err, setErr] = useState('');
  const act = useAction(() => api.post(`/dispositions/${disp.id}/kembalikan`, { alasan }), { success: 'Disposisi sudah dikembalikan.', keys: KEYS, onDone: () => o.onOpenChange(false) });
  return (
    <ActionDialog {...o} danger title="Kembalikan disposisi?" description={`Disposisi dari ${disp.dari_nama} akan kembali kepadanya beserta alasan Anda.`}
      error={err} confirmLabel="Kembalikan Disposisi" pending={act.isPending}
      onConfirm={() => { if (!alasan.trim()) { setErr('Tulis alasan pengembalian.'); return; } setErr(''); act.mutate(); }}>
      <Field label="Alasan pengembalian" required>{(p) => <Textarea {...p} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: Surat ini bukan tugas unit kami." />}</Field>
    </ActionDialog>
  );
}

/* ---------- Tugas ---------- */

export function TaskDialog({ data, ...o }: DialogProps & { data: LetterInDetail }) {
  const users = useUserOptions();
  const holds = data.dispositions.filter((d) => data.holds.includes(d.id));
  const [f, setF] = useState({ judul: '', deskripsi: '', pic_user_id: '', disposition_id: String(holds[0]?.id || ''), deadline: plusDays(3), prioritas: 'Normal', checklist: '' });
  const [err, setErr] = useState('');
  const act = useAction(() => api.post(`/letters-in/${data.letter.id}/tugas`, {
    ...f, pic_user_id: Number(f.pic_user_id), disposition_id: f.disposition_id ? Number(f.disposition_id) : null,
    checklist: f.checklist.split('\n').map((s) => s.trim()).filter(Boolean),
  }), { success: 'Tugas sudah diberikan. Penanggung jawab mendapat pemberitahuan.', keys: KEYS, onDone: () => o.onOpenChange(false) });
  return (
    <ActionDialog {...o} title="Tugaskan pegawai" description="Pegawai yang dipilih akan mendapat pemberitahuan dan tugas ini muncul di Pekerjaan Saya miliknya."
      error={err} confirmLabel="Berikan Tugas" pending={act.isPending}
      onConfirm={() => {
        if (!f.judul.trim()) return setErr('Tulis judul tugas.');
        if (!f.pic_user_id) return setErr('Pilih siapa yang mengerjakan.');
        setErr(''); act.mutate();
      }}>
      <Field label="Judul tugas" required>{(p) => <Input {...p} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} placeholder="Contoh: Menyiapkan data peserta didik" />}</Field>
      <Field label="Siapa yang mengerjakan" required>
        {(p) => (
          <NativeSelect {...p} value={f.pic_user_id} onChange={(e) => setF({ ...f, pic_user_id: e.target.value })}>
            <option value="">Pilih pegawai</option>
            {(users.data || []).filter((u) => u.role !== 'viewer').map((u) => <option key={u.id} value={u.id}>{u.nama}{u.unit_nama ? ` (${u.unit_nama})` : ''}</option>)}
          </NativeSelect>
        )}
      </Field>
      <Field label="Harus selesai paling lambat" required>{(p) => <Input {...p} type="date" min={todayIso()} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}</Field>
      <Field label="Penjelasan">{(p) => <Textarea {...p} value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} />}</Field>
      <Field label="Daftar langkah" hint="Satu langkah per baris. Pegawai mencentangnya satu per satu.">{(p) => <Textarea {...p} value={f.checklist} onChange={(e) => setF({ ...f, checklist: e.target.value })} placeholder={'Rekap data per kelas\nPeriksa NISN'} />}</Field>
      <Choices legend="Seberapa mendesak">
        <RadioGroup value={f.prioritas} onValueChange={(v) => setF({ ...f, prioritas: v })}>
          {PRIORITAS.map((p) => <ChoiceRow key={p}><RadioGroupItem value={p} /><span>{p}</span></ChoiceRow>)}
        </RadioGroup>
      </Choices>
    </ActionDialog>
  );
}

/* ---------- Dokumen ---------- */

export function UploadDialog({ data, ...o }: DialogProps & { data: LetterInDetail }) {
  const user = useUser();
  const [kategori, setKategori] = useState('PENDUKUNG');
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const act = useAction(() => api.upload(`/letters-in/${data.letter.id}/lampiran`, { kategori }, { files }), { success: 'Dokumen sudah tersimpan.', keys: KEYS, onDone: () => { setFiles([]); o.onOpenChange(false); } });
  const opts = [['PENDUKUNG', 'Dokumen pendukung'], ['HASIL', 'Hasil pekerjaan'], ['DRAF', 'Draf'], ['FINAL', 'Dokumen akhir'], ['BUKTI', 'Bukti'], ...(['tu', 'superadmin'].includes(user.role) ? [['SURAT', 'Hasil pindai surat masuk']] : [])];
  return (
    <ActionDialog {...o} title="Tambah dokumen" description="Dokumen tersimpan bersama surat ini. File dengan nama yang sama menjadi versi baru, versi lama tidak hilang."
      error={err} confirmLabel="Simpan Dokumen" pending={act.isPending}
      onConfirm={() => { if (!files.length) { setErr('Pilih minimal satu file.'); return; } setErr(''); act.mutate(); }}>
      <Field label="Jenis dokumen" required>{(p) => <NativeSelect {...p} value={kategori} onChange={(e) => setKategori(e.target.value)}>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</NativeSelect>}</Field>
      <FilePicker files={files} onChange={setFiles} accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.xls,.doc,.csv,.txt" hint="PDF, Word, Excel, atau foto. Paling besar 15 MB per file." />
    </ActionDialog>
  );
}

/* ---------- Kabari pengirim ---------- */

export function ConfirmDialog({ data, ...o }: DialogProps & { data: LetterInDetail }) {
  const metodeList = useRefValues('metode_konfirmasi', METODE);
  const [f, setF] = useState({ tanggal: todayIso(), metode: 'Surat resmi', pihak: data.letter.asal, hasil: '', catatan: '' });
  const [bukti, setBukti] = useState<File[]>([]);
  const [err, setErr] = useState('');
  const act = useAction(() => api.upload(`/letters-in/${data.letter.id}/konfirmasi`, f, { bukti: bukti[0] }), { success: 'Kabar ke pengirim sudah dicatat.', keys: KEYS, onDone: () => o.onOpenChange(false) });
  return (
    <ActionDialog {...o} title="Catat kabar ke pengirim" description="Catat bahwa pengirim surat sudah diberi tahu hasil tindak lanjutnya. Ini salah satu syarat surat dapat dinyatakan selesai."
      error={err} confirmLabel="Simpan Catatan" pending={act.isPending}
      onConfirm={() => { if (!f.pihak.trim() || !f.hasil.trim()) { setErr('Isi siapa yang dikabari dan apa hasilnya.'); return; } setErr(''); act.mutate(); }}>
      <Field label="Siapa yang dikabari" required>{(p) => <Input {...p} value={f.pihak} onChange={(e) => setF({ ...f, pihak: e.target.value })} />}</Field>
      <Field label="Dikabari lewat" required>{(p) => <NativeSelect {...p} value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value })}>{metodeList.map((m) => <option key={m}>{m}</option>)}</NativeSelect>}</Field>
      <Field label="Tanggal" required>{(p) => <Input {...p} type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} />}</Field>
      <Field label="Hasilnya" required>{(p) => <Textarea {...p} value={f.hasil} onChange={(e) => setF({ ...f, hasil: e.target.value })} placeholder="Contoh: Pengirim sudah menerima surat balasan." />}</Field>
      <div className="flex flex-col gap-2"><span className="font-bold">Bukti <span className="font-normal text-muted-foreground">(boleh dikosongkan)</span></span><FilePicker files={bukti} onChange={setBukti} multiple={false} label="Pilih File Bukti" /></div>
    </ActionDialog>
  );
}

/* ---------- Selesai ---------- */

export function FinishDialog({ data, ...o }: DialogProps & { data: LetterInDetail }) {
  const act = useAction(() => api.post(`/letters-in/${data.letter.id}/selesaikan`), { success: 'Surat sudah dinyatakan selesai.', keys: KEYS, onDone: () => o.onOpenChange(false) });
  return (
    <ActionDialog {...o} title="Nyatakan surat ini selesai?" description="Semua orang yang terlibat akan diberi tahu. Setelah selesai, surat tidak dapat diubah lagi."
      confirmLabel="Ya, Nyatakan Selesai" pending={act.isPending} onConfirm={() => act.mutate()}>
      <ul className="flex flex-col gap-2">
        {data.syarat.checks.map((c) => (
          <li key={c.label} className="flex items-start gap-3 text-lg">
            {c.ok ? <CheckIcon className="mt-1 size-5 shrink-0 text-ok" strokeWidth={3} aria-hidden /> : <MinusIcon className="mt-1 size-5 shrink-0 text-late" strokeWidth={3} aria-hidden />}
            <span>{c.label}<span className="sr-only">{c.ok ? ', sudah terpenuhi' : ', belum terpenuhi'}</span></span>
          </li>
        ))}
      </ul>
      {!data.syarat.ok && <Alert variant="warn">Masih ada syarat yang belum terpenuhi. Surat baru bisa dinyatakan selesai setelah semuanya bercentang.</Alert>}
    </ActionDialog>
  );
}

/* ---------- Ubah data ---------- */

export function EditDialog({ data, ...o }: DialogProps & { data: LetterInDetail }) {
  const l = data.letter;
  const sifatList = useRefValues('sifat', SIFAT);
  const [f, setF] = useState({ no_surat: l.no_surat, tgl_surat: l.tgl_surat, asal: l.asal, instansi: l.instansi || '', alamat: l.alamat || '', perihal: l.perihal, sifat: l.sifat, prioritas: l.prioritas, lampiran: l.lampiran || '', catatan: l.catatan || '' });
  const act = useAction(() => api.put(`/letters-in/${l.id}`, f), { success: 'Data surat sudah diperbarui.', keys: KEYS, onDone: () => o.onOpenChange(false) });
  const s = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <ActionDialog {...o} title="Ubah data surat" confirmLabel="Simpan Perubahan" pending={act.isPending} onConfirm={() => act.mutate()}>
      <Field label="Perihal" required>{(p) => <Textarea {...p} value={f.perihal} onChange={s('perihal')} />}</Field>
      <Field label="Nomor surat" required>{(p) => <Input {...p} value={f.no_surat} onChange={s('no_surat')} />}</Field>
      <Field label="Tanggal surat" required>{(p) => <Input {...p} type="date" value={f.tgl_surat} onChange={s('tgl_surat')} />}</Field>
      <Field label="Pengirim (nama atau jabatan)" required>{(p) => <Input {...p} value={f.asal} onChange={s('asal')} />}</Field>
      <Field label="Instansi pengirim">{(p) => <Input {...p} value={f.instansi} onChange={s('instansi')} />}</Field>
      <Field label="Alamat pengirim">{(p) => <Input {...p} value={f.alamat} onChange={s('alamat')} />}</Field>
      <Field label="Sifat surat" required>{(p) => <NativeSelect {...p} value={f.sifat} onChange={s('sifat')}>{sifatList.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
      <Field label="Seberapa mendesak" required>{(p) => <NativeSelect {...p} value={f.prioritas} onChange={s('prioritas')}>{PRIORITAS.map((x) => <option key={x}>{x}</option>)}</NativeSelect>}</Field>
      <Field label="Lampiran">{(p) => <Input {...p} value={f.lampiran} onChange={s('lampiran')} />}</Field>
      <Field label="Catatan">{(p) => <Input {...p} value={f.catatan} onChange={s('catatan')} />}</Field>
    </ActionDialog>
  );
}

/* ---------- Kode QR dan pelacakan ---------- */


export function QrDialog({ id, ...o }: DialogProps & { id: number }) {
  const q = useQuery({ queryKey: ['qr-img', id], queryFn: () => api.get<{ url: string; dataUrl: string }>(`/letters-in/${id}/qr`), enabled: o.open });
  return (
    <Dialog {...o}>
      <DialogContent>
        <DialogHeader><DialogTitle>Kode QR surat</DialogTitle><DialogDescription>Tempel di map surat. Bila dipindai, membuka halaman surat ini (perlu masuk ke aplikasi).</DialogDescription></DialogHeader>
        <DialogBody className="items-center text-center">
          {q.data ? <><img src={q.data.dataUrl} alt="Kode QR halaman surat" width={240} height={240} /><p className="break-all text-muted-foreground">{q.data.url}</p></> : <Loading rows={1} />}
          <Button variant="outline" onClick={() => window.print()}>Cetak</Button>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function TrackDialog({ id, canEdit, ...o }: DialogProps & { id: number; canEdit: boolean }) {
  const q = useQuery({ queryKey: ['track', id], queryFn: () => api.get<{ kode: string; url: string; aktif: boolean; rahasia: boolean }>(`/letters-in/${id}/pelacakan`), enabled: o.open });
  const [confirm, setConfirm] = useState(false);
  const act = useAction((aksi: string) => api.post(`/letters-in/${id}/pelacakan`, { aksi }), { success: 'Pengaturan pelacakan sudah disimpan.', keys: ['track', 'timeline'], onDone: () => setConfirm(false) });
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} sudah disalin. Tempel di pesan untuk pengirim.`); } catch { toast.error('Tidak dapat menyalin otomatis. Salin dari kotak secara manual.'); }
  };
  const d = q.data;
  return (
    <Dialog {...o}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pelacakan oleh pengirim surat</DialogTitle>
          <DialogDescription>Kirim kode atau tautan ini ke pengirim. Pengirim dapat melihat tahapan surat tanpa masuk aplikasi. Isi surat, nama pegawai, dan catatan tidak ditampilkan.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {!d ? <Loading rows={2} /> : (
            <>
              {d.rahasia && <Alert variant="warn">Surat ini bersifat rahasia, jadi pelacakan dimatikan sejak awal.</Alert>}
              <p className="text-lg">Pelacakan saat ini: <strong>{d.aktif ? 'aktif' : 'mati'}</strong>.</p>
              <div className="flex flex-col gap-2">
                <span className="font-bold">Kode pelacakan</span>
                <div className="flex flex-col gap-2 sm:flex-row"><Input readOnly value={d.kode} className="font-bold tracking-wider" onFocus={(e) => e.target.select()} aria-label="Kode pelacakan" /><Button variant="outline" onClick={() => copy(d.kode, 'Kode')}>Salin Kode</Button></div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-bold">Tautan pelacakan</span>
                <div className="flex flex-col gap-2 sm:flex-row"><Input readOnly value={d.url} onFocus={(e) => e.target.select()} aria-label="Tautan pelacakan" /><Button variant="outline" onClick={() => copy(d.url, 'Tautan')}>Salin Tautan</Button></div>
              </div>
              {canEdit && (
                <div className="flex flex-col gap-3 border-t border-line pt-4">
                  <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate(d.aktif ? 'nonaktifkan' : 'aktifkan')}>{d.aktif ? 'Matikan Pelacakan' : 'Nyalakan Pelacakan'}</Button>
                  <Button variant="destructive" onClick={() => setConfirm(true)}>Buat Kode Baru</Button>
                </div>
              )}
            </>
          )}
        </DialogBody>
      </DialogContent>
      <ActionDialog open={confirm} onOpenChange={setConfirm} danger title="Buat kode pelacakan baru?" description="Kode dan tautan lama langsung tidak berlaku. Pakai bila tautan terlanjur dikirim ke orang yang salah."
        confirmLabel="Ya, Buat Kode Baru" pending={act.isPending} onConfirm={() => act.mutate('buat_ulang')} />
    </Dialog>
  );
}
