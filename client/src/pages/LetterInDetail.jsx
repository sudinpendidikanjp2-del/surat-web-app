import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, upload } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, Field, FileList, FilePicker, Icon, Input, Loading, Progress, Select, Sheet, Sla, Stamp, StatusDisp, StatusIn, StatusTask, Tabs, Tag, Textarea, useAction, useToast } from '../ui.jsx';
import { Menu, ConfirmDialog } from '../table.jsx';
import { DisposeFields, Foot, initialDispose, validateDispose } from '../forms.jsx';
import { fmtDate, fmtDateTime, METODE, plusDays, PRIORITAS, SIFAT, todayIso } from '../format.js';

const KEYS = ['letter', 'letters-in', 'dashboard', 'timeline', 'dispositions', 'tasks'];

function Body({ children }) { return <div className="sheet-body">{children}</div>; }
/* ---------- Disposisi ---------- */
function DisposeSheet({ letter, parent, onClose }) {
  const [f, setF] = useState(initialDispose());
  const [err, setErr] = useState('');
  const act = useAction(() => post(`/letters-in/${letter.id}/disposisi`, { ...f, parent_id: parent?.id }), { success: parent ? 'Disposisi diteruskan' : 'Disposisi diberikan', keys: KEYS });
  const submit = (close) => {
    const e = validateDispose(f);
    setErr(e);
    if (!e) act.mutate(undefined, { onSuccess: () => close() });
  };
  return (
    <Sheet title={parent ? 'Teruskan disposisi' : 'Berikan disposisi'} onClose={onClose} wide footer={({ close }) => <Foot close={close} pending={act.isPending} label={parent ? 'Teruskan Disposisi' : 'Kirim Disposisi'} onSubmit={() => submit(close)} />}>
      <Body>
        <p className="muted"><Stamp>{letter.no_agenda}</Stamp> {letter.perihal}</p>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <DisposeFields f={f} setF={setF} onlyStaff={Boolean(parent)} />
      </Body>
    </Sheet>
  );
}

function ReturnSheet({ disp, onClose }) {
  const [alasan, setAlasan] = useState('');
  const [err, setErr] = useState('');
  const act = useAction(() => post(`/dispositions/${disp.id}/kembalikan`, { alasan }), { success: 'Disposisi dikembalikan', keys: KEYS });
  return (
    <Sheet title="Kembalikan disposisi" onClose={onClose} footer={({ close }) => <Foot close={close} pending={act.isPending} danger label="Kembalikan ke Pemberi" onSubmit={() => { if (!alasan.trim()) return setErr('Alasan wajib diisi'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <Body>
        <p className="muted">Disposisi dari {disp.dari_nama} akan kembali kepadanya beserta alasan Anda.</p>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label="Alasan pengembalian">{(id) => <Textarea id={id} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Contoh: Data belum lengkap." />}</Field>
      </Body>
    </Sheet>
  );
}

/* ---------- Tugas ---------- */
function TaskSheet({ data, onClose }) {
  const users = useQuery({ queryKey: ['user-options'], queryFn: () => get('/users/options') });
  const holds = data.dispositions.filter((d) => data.holds.includes(d.id));
  const [f, setF] = useState({ judul: '', deskripsi: '', pic_user_id: '', disposition_id: holds[0]?.id || '', start_date: todayIso(), deadline: plusDays(3), prioritas: 'Normal', checklist: '' });
  const [err, setErr] = useState('');
  const act = useAction(() => post(`/letters-in/${data.letter.id}/tugas`, { ...f, pic_user_id: Number(f.pic_user_id), disposition_id: f.disposition_id ? Number(f.disposition_id) : null, checklist: f.checklist.split('\n').map((s) => s.trim()).filter(Boolean) }), { success: 'Tugas diberikan', keys: KEYS });
  const submit = (close) => {
    if (!f.judul.trim()) return setErr('Judul tugas wajib diisi');
    if (!f.pic_user_id) return setErr('Pilih penanggung jawab');
    setErr('');
    act.mutate(undefined, { onSuccess: () => close() });
    return undefined;
  };
  return (
    <Sheet title="Tugaskan pegawai" onClose={onClose} wide footer={({ close }) => <Foot close={close} pending={act.isPending} label="Berikan Tugas" onSubmit={() => submit(close)} />}>
      <Body>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label="Judul tugas">{(id) => <Input id={id} value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} placeholder="Contoh: Menyiapkan data peserta didik" />}</Field>
        <Field label="Deskripsi">{(id) => <Textarea id={id} rows={3} value={f.deskripsi} onChange={(e) => setF({ ...f, deskripsi: e.target.value })} />}</Field>
        <div className="form-grid">
          <Field label="Penanggung jawab (PIC)">{(id) => <Select id={id} value={f.pic_user_id} onChange={(e) => setF({ ...f, pic_user_id: e.target.value })} placeholder="Pilih pegawai" options={(users.data || []).filter((u) => u.role !== 'viewer').map((u) => ({ value: u.id, label: `${u.nama}${u.unit_nama ? ` (${u.unit_nama})` : ''}` }))} />}</Field>
          <Field label="Prioritas">{(id) => <Select id={id} value={f.prioritas} onChange={(e) => setF({ ...f, prioritas: e.target.value })} options={PRIORITAS} />}</Field>
          <Field label="Tanggal mulai">{(id) => <Input id={id} type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} />}</Field>
          <Field label="Batas waktu">{(id) => <Input id={id} type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} />}</Field>
          {holds.length > 0 && <Field label="Disposisi terkait" span2>{(id) => <Select id={id} value={f.disposition_id} onChange={(e) => setF({ ...f, disposition_id: e.target.value })} placeholder="Tanpa disposisi tertentu" options={holds.map((d) => ({ value: d.id, label: `Dari ${d.dari_nama}: ${d.instruksi.slice(0, 50)}` }))} />}</Field>}
        </div>
        <Field label="Daftar periksa" hint="Satu butir per baris. Opsional.">{(id) => <Textarea id={id} rows={3} value={f.checklist} onChange={(e) => setF({ ...f, checklist: e.target.value })} />}</Field>
      </Body>
    </Sheet>
  );
}

/* ---------- Dokumen, konfirmasi, selesai, ubah, QR ---------- */
function UploadSheet({ data, onClose }) {
  const user = useUser();
  const [kategori, setKategori] = useState('PENDUKUNG');
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState('');
  const act = useAction(() => upload(`/letters-in/${data.letter.id}/lampiran`, { kategori }, { files }), { success: 'Dokumen diunggah', keys: KEYS });
  const opts = [{ value: 'PENDUKUNG', label: 'Dokumen pendukung' }, { value: 'HASIL', label: 'Hasil tindak lanjut' }, { value: 'DRAF', label: 'Draf' }, { value: 'FINAL', label: 'Dokumen final' }, { value: 'BUKTI', label: 'Bukti' }, ...(['tu', 'superadmin'].includes(user.role) ? [{ value: 'SURAT', label: 'Scan surat masuk' }] : [])];
  return (
    <Sheet title="Unggah dokumen" onClose={onClose} footer={({ close }) => <Foot close={close} pending={act.isPending} label="Unggah" onSubmit={() => { if (!files.length) return setErr('Pilih minimal satu file'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <Body>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <Field label="Jenis dokumen" hint="File dengan nama dan jenis yang sama disimpan sebagai versi baru. Versi lama tidak hilang.">{(id) => <Select id={id} value={kategori} onChange={(e) => setKategori(e.target.value)} options={opts} />}</Field>
        <FilePicker files={files} setFiles={setFiles} accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.xls,.doc,.csv,.txt" />
      </Body>
    </Sheet>
  );
}

function ConfirmSheet({ data, onClose }) {
  const [f, setF] = useState({ tanggal: todayIso(), metode: 'Surat resmi', pihak: data.letter.asal, hasil: '', catatan: '' });
  const [bukti, setBukti] = useState([]);
  const [err, setErr] = useState('');
  const act = useAction(() => upload(`/letters-in/${data.letter.id}/konfirmasi`, f, { bukti: bukti[0] }), { success: 'Konfirmasi dicatat', keys: KEYS });
  return (
    <Sheet title="Konfirmasi kepada pemberi surat" onClose={onClose} wide footer={({ close }) => <Foot close={close} pending={act.isPending} label="Catat Konfirmasi" onSubmit={() => { if (!f.pihak.trim() || !f.hasil.trim()) return setErr('Pihak yang dikonfirmasi dan hasil wajib diisi'); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <Body>
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <div className="form-grid">
          <Field label="Tanggal konfirmasi">{(id) => <Input id={id} type="date" value={f.tanggal} onChange={(e) => setF({ ...f, tanggal: e.target.value })} />}</Field>
          <Field label="Metode">{(id) => <Select id={id} value={f.metode} onChange={(e) => setF({ ...f, metode: e.target.value })} options={METODE} />}</Field>
          <Field label="Pihak yang dikonfirmasi" span2>{(id) => <Input id={id} value={f.pihak} onChange={(e) => setF({ ...f, pihak: e.target.value })} />}</Field>
          <Field label="Hasil konfirmasi" span2>{(id) => <Textarea id={id} rows={3} value={f.hasil} onChange={(e) => setF({ ...f, hasil: e.target.value })} />}</Field>
          <Field label="Catatan" span2>{(id) => <Input id={id} value={f.catatan} onChange={(e) => setF({ ...f, catatan: e.target.value })} />}</Field>
        </div>
        <div className="field"><span className="label">Bukti konfirmasi (opsional)</span><FilePicker files={bukti} setFiles={setBukti} multiple={false} /></div>
      </Body>
    </Sheet>
  );
}

function FinishSheet({ data, onClose }) {
  const act = useAction(() => post(`/letters-in/${data.letter.id}/selesaikan`), { success: 'Surat dinyatakan selesai', keys: KEYS });
  return (
    <Sheet title="Selesaikan surat" onClose={onClose} footer={({ close }) => <Foot close={close} pending={act.isPending} label="Ya, Selesaikan Surat" onSubmit={() => act.mutate(undefined, { onSuccess: () => close() })} />}>
      <Body>
        <p><strong>Apakah seluruh tindak lanjut surat ini telah selesai?</strong></p>
        <ul className="checklist">
          {data.syarat.checks.map((c) => (
            <li key={c.label}><span className={c.ok ? 'ok' : 'no'} aria-hidden="true">{c.ok ? <Icon name="check" size={18} /> : <span style={{ display: 'inline-block', width: 18, textAlign: 'center' }}>-</span>}</span><span>{c.label}<span className="sr-only">{c.ok ? ', terpenuhi' : ', belum terpenuhi'}</span></span></li>
          ))}
        </ul>
        {!data.syarat.ok && <div className="alert alert-warn">Syarat belum terpenuhi. Surat baru dapat diselesaikan setelah semuanya terpenuhi.</div>}
      </Body>
    </Sheet>
  );
}

function EditSheet({ data, onClose }) {
  const l = data.letter;
  const [f, setF] = useState({ no_surat: l.no_surat, tgl_surat: l.tgl_surat, asal: l.asal, instansi: l.instansi || '', alamat: l.alamat || '', perihal: l.perihal, sifat: l.sifat, prioritas: l.prioritas, lampiran: l.lampiran || '', catatan: l.catatan || '' });
  const act = useAction(() => put(`/letters-in/${l.id}`, f), { success: 'Data surat diperbarui', keys: KEYS });
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Sheet title="Ubah data surat" onClose={onClose} wide footer={({ close }) => <Foot close={close} pending={act.isPending} label="Simpan Perubahan" onSubmit={() => act.mutate(undefined, { onSuccess: () => close() })} />}>
      <Body>
        <div className="form-grid">
          <Field label="Nomor surat">{(id) => <Input id={id} value={f.no_surat} onChange={s('no_surat')} />}</Field>
          <Field label="Tanggal surat">{(id) => <Input id={id} type="date" value={f.tgl_surat} onChange={s('tgl_surat')} />}</Field>
          <Field label="Asal surat">{(id) => <Input id={id} value={f.asal} onChange={s('asal')} />}</Field>
          <Field label="Instansi">{(id) => <Input id={id} value={f.instansi} onChange={s('instansi')} />}</Field>
          <Field label="Alamat" span2>{(id) => <Input id={id} value={f.alamat} onChange={s('alamat')} />}</Field>
          <Field label="Perihal" span2>{(id) => <Textarea id={id} rows={2} value={f.perihal} onChange={s('perihal')} />}</Field>
          <Field label="Sifat">{(id) => <Select id={id} value={f.sifat} onChange={s('sifat')} options={SIFAT} />}</Field>
          <Field label="Prioritas">{(id) => <Select id={id} value={f.prioritas} onChange={s('prioritas')} options={PRIORITAS} />}</Field>
          <Field label="Lampiran">{(id) => <Input id={id} value={f.lampiran} onChange={s('lampiran')} />}</Field>
          <Field label="Catatan">{(id) => <Input id={id} value={f.catatan} onChange={s('catatan')} />}</Field>
        </div>
      </Body>
    </Sheet>
  );
}

function QrSheet({ id, onClose }) {
  const q = useQuery({ queryKey: ['qr-img', id], queryFn: () => get(`/letters-in/${id}/qr`) });
  return (
    <Sheet title="Kode QR surat" onClose={onClose}>
      <Body>
        <Async q={q} isEmpty={() => false} rows={2}>
          {(d) => (
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <img src={d.dataUrl} alt="Kode QR untuk membuka halaman status surat" width="240" height="240" />
              <p className="muted small">Pindai untuk membuka status surat. Pengguna wajib masuk dan memiliki hak akses ke surat ini.</p>
              <code className="small" style={{ overflowWrap: 'anywhere' }}>{d.url}</code>
            </div>
          )}
        </Async>
      </Body>
    </Sheet>
  );
}

function TrackSheet({ id, canEdit, onClose }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['track', id], queryFn: () => get(`/letters-in/${id}/pelacakan`) });
  const [confirm, setConfirm] = useState(null);
  const act = useAction((aksi) => post(`/letters-in/${id}/pelacakan`, { aksi }), { success: 'Pengaturan pelacakan disimpan', keys: ['track', 'timeline'], onDone: () => setConfirm(null) });
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(`${what} disalin`); } catch { toast('Tidak dapat menyalin. Salin manual dari kolom.', { error: true }); } };
  return (
    <Sheet title="Pelacakan oleh pengirim surat" onClose={onClose}>
      <Body>
        <Async q={q} isEmpty={() => false} rows={3}>
          {(d) => (
            <>
              <p className="muted">Berikan tautan atau kode ini kepada pengirim surat agar dapat memantau tahapan tanpa login. Pengirim hanya melihat tahapan umum: tanpa perihal, nama pegawai, atau catatan internal.</p>
              {d.rahasia && <div className="alert alert-warn">Surat bersifat rahasia. Pelacakan publik dimatikan secara bawaan.</div>}
              <div className="row"><Tag tone={d.aktif ? 'ok' : 'neutral'}>{d.aktif ? 'Aktif' : 'Nonaktif'}</Tag><span className="muted small">Berakhir otomatis 30 hari setelah surat selesai.</span></div>
              <Field label="Kode pelacakan" hint="Mudah diketik. Huruf O dan I dibaca sebagai 0 dan 1.">{(fid) => <div className="copy-field"><input id={fid} className="input num" readOnly value={d.kode} onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={() => copy(d.kode, 'Kode')}>Salin</button></div>}</Field>
              <Field label="Tautan pelacakan">{(fid) => <div className="copy-field"><input id={fid} className="input" readOnly value={d.url} onFocus={(e) => e.target.select()} /><button type="button" className="btn" onClick={() => copy(d.url, 'Tautan')}>Salin</button></div>}</Field>
              {canEdit && (
                <div className="actions">
                  <button type="button" className="btn" disabled={act.isPending} onClick={() => act.mutate(d.aktif ? 'nonaktifkan' : 'aktifkan')}>{d.aktif ? 'Nonaktifkan Pelacakan' : 'Aktifkan Pelacakan'}</button>
                  <button type="button" className="btn btn-danger" onClick={() => setConfirm('buat_ulang')}>Buat Ulang Kode</button>
                </div>
              )}
              {confirm && <ConfirmDialog title="Buat ulang kode pelacakan?" tone="danger" confirmLabel="Buat Ulang" pending={act.isPending} onClose={() => setConfirm(null)} onConfirm={() => act.mutate('buat_ulang')}><p>Tautan dan kode lama langsung tidak berlaku. Gunakan bila tautan terlanjur dibagikan ke pihak yang salah.</p></ConfirmDialog>}
            </>
          )}
        </Async>
      </Body>
    </Sheet>
  );
}

/* ---------- Riwayat dan komentar ---------- */
const renderText = (t) => t.split(/(@[a-z0-9._-]+)/gi).map((p, i) => (p.startsWith('@') ? <strong key={i}>{p}</strong> : p));

function Timeline({ id }) {
  const user = useUser();
  const q = useQuery({ queryKey: ['timeline', id], queryFn: () => get(`/letters-in/${id}/timeline`) });
  const [teks, setTeks] = useState('');
  const act = useAction(() => post(`/letters-in/${id}/komentar`, { teks }), { keys: ['timeline'], onDone: () => setTeks('') });
  return (
    <div className="stack" style={{ gap: 20 }}>
      {user.role !== 'viewer' && (
        <form onSubmit={(e) => { e.preventDefault(); if (teks.trim()) act.mutate(); }} className="stack">
          <Field label="Tambah catatan atau komentar" hint="Gunakan @namapengguna untuk menyebut rekan, misalnya @andi.">{(fid) => <Textarea id={fid} rows={2} value={teks} onChange={(e) => setTeks(e.target.value)} />}</Field>
          <div><button type="submit" className="btn btn-primary btn-sm" disabled={act.isPending || !teks.trim()}>Kirim Catatan</button></div>
        </form>
      )}
      <Async q={q} empty={<Empty title="Belum ada riwayat" />}>
        {(rows) => (
          <ol className="thread" aria-label="Riwayat surat">
            {[...rows].reverse().map((e) => (
              <li key={e.id} className={`t-${e.tipe}`}>
                <div className="when">{fmtDateTime(e.created_at)}{e.user_nama ? ` · ${e.user_nama}` : ''}</div>
                {e.tipe === 'komentar' ? <div className="comment-text">{renderText(e.teks)}</div> : <div>{e.teks}</div>}
              </li>
            ))}
          </ol>
        )}
      </Async>
    </div>
  );
}

/* ---------- Halaman ---------- */
/** Langkah berikutnya untuk pengguna ini pada surat ini. Satu tombol utama, penjelasan satu kalimat. */
function nextStep(d, user, run) {
  const l = d.letter;
  const can = d.can;
  const openTasks = d.tasks.filter((t) => !['SELESAI', 'DIBATALKAN'].includes(t.status));
  const mine = openTasks.filter((t) => t.pic_user_id === user.id);
  const myNew = d.dispositions.find((x) => d.holds.includes(x.id) && x.status === 'BARU');
  if (l.status === 'DIARSIPKAN') return { quiet: true, title: 'Surat sudah diarsipkan', desc: 'Seluruh dokumen dan riwayat tetap dapat dibuka.' };
  if (l.status === 'SELESAI') return can.arsipkan ? { title: 'Surat sudah selesai', desc: 'Arsipkan agar tersimpan rapi per tahun dan bulan.', primary: { label: 'Arsipkan Surat', onClick: run.archive } } : { quiet: true, title: 'Surat sudah selesai', desc: 'Menunggu Tata Usaha mengarsipkan.' };
  if (can.forward) return { title: 'Teruskan surat ini kepada pimpinan', desc: 'Surat sudah tercatat. Pimpinan perlu memberi disposisi.', primary: { label: 'Teruskan kepada Pimpinan', onClick: run.forward } };
  if (can.terima && myNew) return { title: 'Anda menerima disposisi baru', desc: `Dari ${myNew.dari_nama}: ${myNew.instruksi}`, primary: { label: 'Terima Disposisi', onClick: () => run.accept(myNew.id) } };
  if (l.status === 'MENUNGGU_DISPOSISI' && can.disposisi && ['pimpinan', 'superadmin'].includes(user.role)) return { title: 'Surat menunggu disposisi Anda', desc: 'Pilih penerima, instruksi, dan batas waktu.', primary: { label: 'Berikan Disposisi', onClick: () => run.sheet({ k: 'dispose' }) } };
  if (mine.length) return { title: `Anda memegang ${mine.length} tugas pada surat ini`, desc: `Tenggat terdekat ${fmtDate(mine.map((t) => t.deadline).sort()[0])}.`, primary: { label: 'Buka Tugas Saya', to: `/tugas/${mine[0].id}` } };
  if (can.tugaskan && d.tasks.length === 0 && d.holds.length > 0) return { title: 'Bagi pekerjaan kepada pegawai', desc: 'Buat tugas dengan penanggung jawab dan batas waktu.', primary: { label: 'Tugaskan', onClick: () => run.sheet({ k: 'task' }) } };
  if (can.selesaikan && d.syarat.ok) return { title: 'Semua syarat penyelesaian terpenuhi', desc: 'Tugas selesai, balasan terkirim, dan konfirmasi dicatat.', primary: { label: 'Selesaikan Surat', onClick: () => run.sheet({ k: 'finish' }) } };
  if (can.konfirmasi && d.tasks.length > 0 && openTasks.length === 0 && d.confirmations.length === 0) return { title: 'Catat konfirmasi kepada pengirim', desc: 'Semua tugas selesai. Konfirmasi ke pemberi surat belum dicatat.', primary: { label: 'Catat Konfirmasi', onClick: () => run.sheet({ k: 'confirm' }) } };
  if (openTasks.length) return { quiet: true, title: `Menunggu ${[...new Set(openTasks.map((t) => t.pic_nama))].join(', ')}`, desc: `${openTasks.length} tugas belum selesai.` };
  if (l.status === 'MENUNGGU_DISPOSISI') return { quiet: true, title: 'Menunggu disposisi pimpinan', desc: 'Pimpinan sudah menerima surat ini.' };
  if (l.status === 'DIDISPOSISIKAN') return { quiet: true, title: 'Menunggu disposisi diterima', desc: 'Penerima belum menerima disposisi.' };
  return { quiet: true, title: 'Tidak ada tindakan untuk Anda saat ini', desc: 'Anda tetap dapat menambah catatan atau dokumen.' };
}

function posisi(d) {
  const l = d.letter;
  if (['SELESAI', 'DIARSIPKAN'].includes(l.status)) return l.status === 'SELESAI' ? 'Selesai' : 'Arsip';
  if (l.status === 'DITERIMA') return 'Tata Usaha';
  if (l.status === 'MENUNGGU_DISPOSISI') return 'Pimpinan';
  const names = [...new Set(d.dispositions.filter((x) => ['BARU', 'DITERIMA'].includes(x.status)).map((x) => x.ke_nama || x.ke_unit))];
  return names.join(', ') || '-';
}

export default function LetterInDetail() {
  const { id } = useParams();
  const user = useUser();
  const q = useQuery({ queryKey: ['letter', id], queryFn: () => get(`/letters-in/${id}`) });
  const [tab, setTab] = useState('ringkasan');
  const [sheet, setSheet] = useState(null);
  const close = () => setSheet(null);
  const forward = useAction(() => post(`/letters-in/${id}/teruskan`), { success: 'Surat diteruskan kepada pimpinan', keys: KEYS });
  const accept = useAction((did) => post(`/dispositions/${did}/terima`), { success: 'Disposisi diterima', keys: KEYS });
  const archive = useAction(() => post(`/letters-in/${id}/arsipkan`), { success: 'Surat diarsipkan', keys: KEYS });

  return (
    <div className="page">
      <Async q={q} isEmpty={() => false} rows={6}>
        {(d) => {
          const l = d.letter;
          const can = d.can;
          const myDisp = d.dispositions.filter((x) => d.holds.includes(x.id) && ['BARU', 'DITERIMA'].includes(x.status));
          const fwdTarget = myDisp.find((x) => x.status === 'DITERIMA') || myDisp[0];
          const step = nextStep(d, user, { forward: () => forward.mutate(), accept: (i) => accept.mutate(i), archive: () => archive.mutate(), sheet: setSheet });
          const busy = forward.isPending || accept.isPending || archive.isPending;
          const canTrack = ['superadmin', 'tu', 'pimpinan'].includes(user.role);
          const more = [
            can.disposisi && fwdTarget && fwdTarget.status === 'DITERIMA' && { label: 'Teruskan Disposisi', onClick: () => setSheet({ k: 'dispose', parent: fwdTarget }) },
            can.disposisi && !fwdTarget && !(l.status === 'MENUNGGU_DISPOSISI' && ['pimpinan', 'superadmin'].includes(user.role)) && { label: 'Berikan Disposisi', onClick: () => setSheet({ k: 'dispose' }) },
            can.tugaskan && { label: 'Tugaskan Pegawai', onClick: () => setSheet({ k: 'task' }) },
            can.balas && { label: 'Buat Surat Balasan', to: `/surat-keluar/baru?dari=${l.id}` },
            can.upload && { label: 'Unggah Dokumen', onClick: () => setSheet({ k: 'upload' }) },
            can.komentar && { label: 'Tambah Catatan', onClick: () => { setTab('riwayat'); } },
            can.konfirmasi && { label: 'Catat Konfirmasi', onClick: () => setSheet({ k: 'confirm' }) },
            can.selesaikan && { label: 'Selesaikan Surat', onClick: () => setSheet({ k: 'finish' }) },
            can.arsipkan && { label: 'Arsipkan', onClick: () => archive.mutate() },
            { sep: true },
            can.edit && { label: 'Ubah Data Surat', onClick: () => setSheet({ k: 'edit' }) },
            can.cetak && { label: 'Lembar Disposisi (cetak)', to: `/surat-masuk/${l.id}/cetak` },
            { label: 'Kode QR surat', onClick: () => setSheet({ k: 'qr' }) },
            canTrack && { label: 'Pelacakan oleh pengirim', onClick: () => setSheet({ k: 'track' }) },
          ].filter(Boolean);
          return (
            <>
              <nav className="crumb" aria-label="Jejak halaman"><Link to="/surat-masuk">Surat masuk</Link><span aria-hidden="true">/</span><span>{l.no_agenda}</span></nav>
              <div className="case-head">
                <div className="row"><Stamp>{l.no_agenda}</Stamp><StatusIn status={l.status} /><Sla sla={d.sla} /></div>
                <h1>{l.perihal}</h1>
                <div className="case-meta"><span>Dari {l.asal}{l.instansi ? `, ${l.instansi}` : ''}</span><span>{l.no_surat}</span><span>Diterima {fmtDate(l.tgl_diterima)}</span><span>Sifat {l.sifat}</span><span>Prioritas {l.prioritas}</span></div>
              </div>

              <section className={`next-step${step.quiet ? ' quiet' : ''}`} aria-label="Langkah berikutnya">
                <div><h2>{step.title}</h2><p>{step.desc}</p></div>
                <div className="actions no-print">
                  {step.primary && (step.primary.to ? <Link className="btn btn-primary" to={step.primary.to}>{step.primary.label}</Link> : <button type="button" className="btn btn-primary" disabled={busy} onClick={step.primary.onClick}>{step.primary.label}</button>)}
                  <Menu label="Aksi lain" items={more} />
                </div>
              </section>

              <div className="detail">
                <div className="stack" style={{ gap: 20 }}>
                  <Tabs label="Bagian surat" value={tab} onChange={setTab} tabs={[
                    { key: 'ringkasan', label: 'Ringkasan' },
                    { key: 'tindak', label: 'Disposisi dan tugas', count: d.dispositions.length + d.tasks.length },
                    { key: 'dokumen', label: 'Dokumen', count: d.attachments.length + d.outs.length },
                    { key: 'riwayat', label: 'Riwayat dan diskusi' },
                  ]} />

                  {tab === 'ringkasan' && (
                    <div className="stack" style={{ gap: 20 }} role="tabpanel" id="panel-ringkasan" aria-labelledby="tab-ringkasan">
                      <section className="card card-pad">
                        <dl className="dl">
                          <dt>Nomor agenda</dt><dd className="num">{l.no_agenda}</dd>
                          <dt>Nomor surat</dt><dd>{l.no_surat}</dd>
                          <dt>Tanggal surat</dt><dd>{fmtDate(l.tgl_surat)}</dd>
                          <dt>Tanggal diterima</dt><dd>{fmtDate(l.tgl_diterima)}</dd>
                          <dt>Pengirim</dt><dd>{l.asal}{l.instansi ? `, ${l.instansi}` : ''}</dd>
                          <dt>Alamat</dt><dd>{l.alamat || '-'}</dd>
                          <dt>Jenis</dt><dd>{l.jenis}</dd>
                          <dt>Lampiran</dt><dd>{l.lampiran || '-'}</dd>
                          <dt>Catatan</dt><dd>{l.catatan || '-'}</dd>
                          <dt>Dicatat oleh</dt><dd>{l.creator_nama}</dd>
                        </dl>
                      </section>
                      <section className="card card-pad stack">
                        <h3>Surat balasan</h3>
                        {d.outs.length === 0 ? <p className="muted">Belum ada surat keluar untuk surat ini.</p> : d.outs.map((o) => (
                          <div key={o.id}><Link to={`/surat-keluar/${o.id}`} className="cell-title">{o.no_agenda}</Link> <span className="muted small">{o.nomor_surat || 'belum bernomor'}</span><div className="small">{o.perihal} <Tag tone="neutral">{o.status}</Tag></div></div>
                        ))}
                        <h3 style={{ marginTop: 8 }}>Konfirmasi kepada pengirim</h3>
                        {d.confirmations.length === 0 ? <p className="muted">Belum ada konfirmasi dicatat.</p> : d.confirmations.map((c) => (
                          <div key={c.id} className="small"><strong>{fmtDate(c.tanggal)}</strong> melalui {c.metode.toLowerCase()} kepada {c.pihak}<div className="muted">{c.hasil}</div></div>
                        ))}
                      </section>
                    </div>
                  )}

                  {tab === 'tindak' && (
                    <div className="stack" style={{ gap: 20 }} role="tabpanel" id="panel-tindak" aria-labelledby="tab-tindak">
                      <section className="section">
                        <h2>Disposisi</h2>
                        {d.dispositions.length === 0 ? <div className="card"><Empty title="Belum ada disposisi" text="Disposisi pimpinan akan tampil di sini." /></div> : d.dispositions.map((x) => (
                          <article key={x.id} className="card card-pad stack" style={{ gap: 8 }}>
                            <div className="row" style={{ justifyContent: 'space-between' }}>
                              <strong>{x.dari_nama} <span className="muted" style={{ fontWeight: 400 }}>kepada</span> {x.ke_nama || x.ke_unit}</strong>
                              <StatusDisp status={x.status} />
                            </div>
                            <div className="chips">{x.tindakan.map((t) => <Tag key={t} tone="accent">{t}</Tag>)}</div>
                            <p>{x.instruksi}</p>
                            <p className="muted small">Batas waktu {fmtDate(x.deadline)}, prioritas {x.prioritas}. Diberikan {fmtDateTime(x.created_at)}{x.accepted_at ? `, diterima ${fmtDateTime(x.accepted_at)}` : ''}.</p>
                            {x.return_reason && <div className="alert alert-late">Dikembalikan: {x.return_reason}</div>}
                            {d.holds.includes(x.id) && ['BARU', 'DITERIMA'].includes(x.status) && (
                              <div className="actions no-print">
                                {x.status === 'BARU' && <button type="button" className="btn btn-sm btn-primary" onClick={() => accept.mutate(x.id)}>Terima Disposisi</button>}
                                <button type="button" className="btn btn-sm btn-danger" onClick={() => setSheet({ k: 'return', disp: x })}>Kembalikan</button>
                              </div>
                            )}
                          </article>
                        ))}
                      </section>
                      <section className="section">
                        <h2>Tugas</h2>
                        {d.tasks.length === 0 ? <div className="card"><Empty title="Belum ada tugas" text="Pejabat penerima disposisi dapat membagi pekerjaan lewat Aksi lain, Tugaskan Pegawai." /></div> : (
                          <div className="card table-wrap">
                            <table className="table stackable">
                              <thead><tr><th>Tugas</th><th>Penanggung jawab</th><th>Status</th><th>Progres</th><th>Tenggat</th></tr></thead>
                              <tbody>{d.tasks.map((t) => (
                                <tr key={t.id}>
                                  <td className="primary"><span className="cell-title"><Link to={`/tugas/${t.id}`}>{t.judul}</Link></span></td>
                                  <td data-label="Penanggung jawab">{t.pic_nama}</td>
                                  <td data-label="Status"><StatusTask status={t.status} /></td>
                                  <td data-label="Progres" className="num">{t.progress}%</td>
                                  <td data-label="Tenggat">{fmtDate(t.deadline)}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        )}
                      </section>
                    </div>
                  )}

                  {tab === 'dokumen' && (
                    <section className="card card-pad" role="tabpanel" id="panel-dokumen" aria-labelledby="tab-dokumen">
                      {user.role === 'viewer' ? <p className="muted">Viewer tidak dapat membuka dokumen surat.</p> : <FileList files={d.attachments} />}
                    </section>
                  )}
                  {tab === 'riwayat' && <section className="card card-pad" role="tabpanel" id="panel-riwayat" aria-labelledby="tab-riwayat"><Timeline id={id} /></section>}
                </div>

                <aside className="side no-print" aria-label="Ringkasan status">
                  <section className="card card-pad stack">
                    <h3>Status saat ini</h3>
                    <dl className="kv">
                      <dt>Posisi</dt><dd>{posisi(d)}</dd>
                      <dt>Tenggat</dt><dd>{fmtDate(d.deadline)}<div><Sla sla={d.sla} /></div></dd>
                      <dt>Progres</dt><dd className="num">{d.percent}%</dd>
                    </dl>
                    <Progress value={d.percent} label="Progres penyelesaian surat" />
                    <details className="more">
                      <summary>Lihat tahapan</summary>
                      <ol className="stages" style={{ gridTemplateColumns: '1fr', margin: 0 }}>
                        {d.stages.map((s) => (<li key={s.key} className={s.done ? 'done' : ''}><span className="stage-mark" aria-hidden="true">{s.done && <Icon name="check" size={12} />}</span><span>{s.label}<span className="sr-only">{s.done ? ', selesai' : ', belum'}</span></span></li>))}
                      </ol>
                    </details>
                  </section>
                </aside>
              </div>

              {sheet?.k === 'dispose' && <DisposeSheet letter={l} parent={sheet.parent} onClose={close} />}
              {sheet?.k === 'return' && <ReturnSheet disp={sheet.disp} onClose={close} />}
              {sheet?.k === 'task' && <TaskSheet data={d} onClose={close} />}
              {sheet?.k === 'upload' && <UploadSheet data={d} onClose={close} />}
              {sheet?.k === 'confirm' && <ConfirmSheet data={d} onClose={close} />}
              {sheet?.k === 'finish' && <FinishSheet data={d} onClose={close} />}
              {sheet?.k === 'edit' && <EditSheet data={d} onClose={close} />}
              {sheet?.k === 'qr' && <QrSheet id={l.id} onClose={close} />}
              {sheet?.k === 'track' && <TrackSheet id={l.id} canEdit={['superadmin', 'tu'].includes(user.role)} onClose={close} />}
            </>
          );
        }}
      </Async>
    </div>
  );
}
