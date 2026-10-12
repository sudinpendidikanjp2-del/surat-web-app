import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { upload } from '../api.js';
import { Field, Input, PageHead, Select, Textarea, useAction, useToast } from '../ui.jsx';
import { PRIORITAS, SIFAT, todayIso } from '../format.js';

const EMPTY = { no_surat: '', tgl_surat: todayIso(), tgl_diterima: todayIso(), asal: '', instansi: '', alamat: '', perihal: '', jenis: 'Surat Dinas', sifat: 'Biasa', prioritas: 'Normal', lampiran: '', catatan: '' };

/** Penanda isian yang kurang yakin dibaca. Tidak ada tanda berarti pembacaan yakin. */
function Conf({ ocr, k, children }) {
  if (!ocr) return children;
  const c = ocr.fields[k];
  const low = !c || c.review;
  return <div className={low ? 'conf-low' : undefined}>{children}{low && <div className="conf-hint" role="note">{c ? `Kurang yakin dibaca (${c.conf}%). Periksa.` : 'Tidak terbaca. Isi manual.'}</div>}</div>;
}

export function LetterInNew() {
  const nav = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState(null); // null = pilih, 'foto', 'manual'
  const [f, setF] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [photo, setPhoto] = useState(null); // { file, url }
  const [ocr, setOcr] = useState(null);
  const [reading, setReading] = useState(false);
  const [over, setOver] = useState(false);
  const [errs, setErrs] = useState({});
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  useEffect(() => () => { if (photo?.url) URL.revokeObjectURL(photo.url); }, [photo]);

  const readPhoto = async (file) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Gunakan foto JPG, PNG, atau WebP. Untuk PDF, pilih "Isi manual" lalu lampirkan berkasnya.', { error: true }); return; }
    setMode('foto'); setReading(true); setOcr(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
    try {
      const r = await upload('/ocr/surat-masuk', {}, { foto: file });
      setOcr(r);
      const g = (k) => r.fields[k]?.value;
      setF((s) => ({ ...s, no_surat: g('no_surat') || '', tgl_surat: g('tgl_surat') || s.tgl_surat, asal: g('asal') || '', instansi: g('instansi') || '', alamat: g('alamat') || '', perihal: g('perihal') || '', sifat: g('sifat') || 'Biasa', lampiran: g('lampiran') || '' }));
    } catch (e) {
      toast(e.message, { error: true });
      setOcr({ fields: {}, missing: [], quality: { warnings: [e.message], meanConf: 0 }, failed: true });
    } finally {
      setReading(false);
    }
  };

  const save = useAction(() => upload('/letters-in', f, { files: [...(photo ? [photo.file] : []), ...files] }), {
    success: (r) => `Surat tercatat dengan nomor agenda ${r.no_agenda}`, keys: ['letters-in', 'dashboard'], onDone: (r) => nav(`/surat-masuk/${r.id}`),
  });
  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!f.no_surat.trim()) er.no_surat = 'Nomor surat wajib diisi';
    if (!f.asal.trim()) er.asal = 'Asal surat wajib diisi';
    if (!f.perihal.trim()) er.perihal = 'Perihal wajib diisi';
    if (f.tgl_diterima < f.tgl_surat) er.tgl_diterima = 'Tanggal diterima tidak boleh sebelum tanggal surat';
    setErrs(er);
    if (Object.keys(er).length === 0) save.mutate();
  };

  if (mode === null) {
    return (
      <div className="page">
        <PageHead title="Catat surat masuk" sub="Pilih cara yang paling cepat. Sistem memberi nomor agenda otomatis setelah disimpan." />
        <div className="ocr-split ocr-choose">
          <section className={`capture${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); readPhoto(e.dataTransfer.files[0]); }} aria-labelledby="h-foto">
            <h2 id="h-foto">Dari foto surat</h2>
            <p className="muted">Foto halaman pertama surat. Sistem membaca nomor, tanggal, pengirim, dan perihal. Anda tinggal memeriksa.</p>
            <div className="actions center">
              <button type="button" className="btn btn-primary" onClick={() => camRef.current?.click()}>Ambil Foto Surat</button>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Pilih Foto dari Galeri</button>
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files[0])} />
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => readPhoto(e.target.files[0])} />
            <p className="small muted">Tips: letakkan surat di permukaan rata, cahaya merata, seluruh halaman terlihat, tanpa bayangan tangan. Anda juga dapat menyeret foto ke kotak ini.</p>
          </section>
          <section className="capture" aria-labelledby="h-manual">
            <h2 id="h-manual">Isi manual</h2>
            <p className="muted">Ketik data surat sendiri. Cocok untuk surat PDF atau bila foto sulit dibaca.</p>
            <button type="button" className="btn" onClick={() => setMode('manual')}>Isi Manual</button>
          </section>
        </div>
      </div>
    );
  }

  const form = (
    <form className="stack stack-md" onSubmit={submit} noValidate>
      <div className="card card-pad stack stack-md">
        <h2>Identitas surat</h2>
        <div className="form-grid">
          <Field label="Nomor surat" error={errs.no_surat}>{(id, e) => <Conf ocr={ocr} k="no_surat"><Input id={id} error={e} value={f.no_surat} onChange={set('no_surat')} /></Conf>}</Field>
          <Field label="Tanggal surat">{(id) => <Conf ocr={ocr} k="tgl_surat"><Input id={id} type="date" value={f.tgl_surat} onChange={set('tgl_surat')} /></Conf>}</Field>
          <Field label="Perihal" span2 error={errs.perihal}>{(id, e) => <Conf ocr={ocr} k="perihal"><Textarea id={id} error={e} rows={2} value={f.perihal} onChange={set('perihal')} /></Conf>}</Field>
          <Field label="Sifat surat">{(id) => <Conf ocr={ocr} k="sifat"><Select id={id} value={f.sifat} onChange={set('sifat')} options={SIFAT} /></Conf>}</Field>
          <Field label="Lampiran">{(id) => <Conf ocr={ocr} k="lampiran"><Input id={id} value={f.lampiran} onChange={set('lampiran')} placeholder="Contoh: 1 berkas" /></Conf>}</Field>
        </div>
      </div>
      <div className="card card-pad stack stack-md">
        <h2>Pengirim</h2>
        <div className="form-grid">
          <Field label="Asal surat (jabatan atau nama pengirim)" error={errs.asal}>{(id, e) => <Conf ocr={ocr} k="asal"><Input id={id} error={e} value={f.asal} onChange={set('asal')} /></Conf>}</Field>
          <Field label="Instansi">{(id) => <Conf ocr={ocr} k="instansi"><Input id={id} value={f.instansi} onChange={set('instansi')} /></Conf>}</Field>
          <Field label="Alamat pengirim" span2>{(id) => <Conf ocr={ocr} k="alamat"><Input id={id} value={f.alamat} onChange={set('alamat')} /></Conf>}</Field>
        </div>
      </div>
      <div className="card card-pad stack stack-md">
        <h2>Penerimaan</h2>
        <div className="form-grid">
          <Field label="Tanggal diterima" error={errs.tgl_diterima}>{(id, e) => <Input id={id} type="date" error={e} value={f.tgl_diterima} onChange={set('tgl_diterima')} />}</Field>
          <Field label="Prioritas" hint="Menentukan target SLA">{(id) => <Select id={id} value={f.prioritas} onChange={set('prioritas')} options={PRIORITAS} />}</Field>
          <Field label="Jenis surat">{(id) => <Input id={id} value={f.jenis} onChange={set('jenis')} />}</Field>
          <Field label="Catatan penerimaan">{(id) => <Input id={id} value={f.catatan} onChange={set('catatan')} />}</Field>
        </div>
        {mode === 'manual' && (
          <div className="field">
            <label className="label" htmlFor="scan-files">Berkas surat (opsional)</label>
            <input id="scan-files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx" onChange={(e) => setFiles([...e.target.files])} />
            <span className="hint">PDF, JPG, PNG, atau DOCX, maksimal 15 MB per file.</span>
          </div>
        )}
      </div>
      <div className="sticky-actions">
        <Link to="/surat-masuk" className="btn">Batal</Link>
        <button type="submit" className="btn btn-primary" disabled={save.isPending || reading}>{save.isPending ? 'Menyimpan…' : 'Simpan dan Beri Nomor Agenda'}</button>
      </div>
    </form>
  );

  if (mode === 'manual') return <div className="page"><PageHead title="Catat surat masuk" sub="Isi manual."><button type="button" className="btn btn-quiet" onClick={() => setMode(null)}>Ganti Cara</button></PageHead>{form}</div>;

  const lowCount = ocr ? ['no_surat', 'tgl_surat', 'asal', 'perihal', 'instansi', 'sifat'].filter((k) => !ocr.fields[k] || ocr.fields[k].review).length : 0;
  return (
    <div className="page">
      <PageHead title="Periksa hasil pembacaan foto" sub="Bandingkan dengan foto di samping. Isian berlatar kuning kurang yakin dibaca."><button type="button" className="btn btn-quiet" onClick={() => { setMode(null); setPhoto(null); setOcr(null); setF(EMPTY); }}>Foto Ulang</button></PageHead>
      <div className="ocr-split">
        <aside className="ocr-photo" aria-label="Foto surat">{photo && <img src={photo.url} alt="Foto surat yang diunggah" />}</aside>
        <div className="stack stack-md">
          {reading ? (
            <div className="card card-pad" role="status" aria-live="polite"><strong>Membaca surat…</strong><p className="muted">Biasanya 5 sampai 15 detik. Jangan tutup halaman ini.</p><div className="skeleton w-70" /><div className="skeleton w-50" /></div>
          ) : ocr && (
            <>
              {ocr.quality.warnings.map((w) => <div key={w} className="alert alert-warn" role="alert">{w}</div>)}
              {!ocr.failed && <div className={`alert ${lowCount ? 'alert-warn' : 'alert-ok'}`} role="status">{lowCount ? `${lowCount} isian perlu Anda periksa. Isian lain terbaca yakin (keyakinan rata-rata ${ocr.quality.meanConf}%), tetap periksa sebelum menyimpan.` : `Semua isian utama terbaca yakin (keyakinan rata-rata ${ocr.quality.meanConf}%). Tetap periksa sebelum menyimpan.`}</div>}
              {form}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
