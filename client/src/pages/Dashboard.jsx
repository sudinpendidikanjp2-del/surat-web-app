import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Empty, Figure as Fig, Stamp, useAction } from '../ui.jsx';
import { fmtDate, fmtDateLong, greeting } from '../format.js';

function Bars({ data }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.masuk, d.selesai]));
  return (
    <figure className="chart">
      <div className="legend"><span><i />Surat masuk</span><span><i className="alt" />Selesai</span></div>
      <div className="bars" role="img" aria-label={`Surat masuk dan selesai per bulan. ${data.map((d) => `${d.bulan}: ${d.masuk} masuk, ${d.selesai} selesai`).join('; ')}`}>
        {data.map((d) => (
          <div className="bar-col" key={d.bulan}>
            <div className="bar-pair">
              <span className="bar" style={{ height: `${(d.masuk / max) * 100}%` }} title={`${d.masuk} masuk`} />
              <span className="bar alt" style={{ height: `${(d.selesai / max) * 100}%` }} title={`${d.selesai} selesai`} />
            </div>
            <span className="bar-label">{d.bulan}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Daftar pekerjaan yang menunggu Anda, urut dari yang paling mendesak. Setiap baris punya satu tombol tindakan. */
function buildInbox(d, user, act) {
  const items = [];
  const leader = ['pimpinan', 'superadmin'].includes(user.role);
  if (leader) {
    (d.tugas_perhatian || []).filter((t) => t.terlambat).forEach((t) => items.push({ key: `tl${t.id}`, kind: 'Tugas terlambat', tone: 'late', title: t.judul, meta: `${t.no_agenda}, ${t.pic_nama}, tenggat ${fmtDate(t.deadline)}`, to: `/tugas/${t.id}`, btn: 'Tinjau' }));
    (d.perlu_disposisi || []).forEach((l) => items.push({ key: `d${l.id}`, kind: 'Menunggu disposisi Anda', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `${l.asal}, ${l.sifat}, diterima ${fmtDate(l.tgl_diterima)}`, to: `/surat-masuk/${l.id}`, btn: 'Berikan Disposisi', primary: true }));
    (d.perlu_persetujuan || []).forEach((l) => items.push({ key: `p${l.id}`, kind: 'Menunggu persetujuan Anda', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `${l.jenis}, dibuat ${l.pembuat}`, to: `/surat-keluar/${l.id}`, btn: 'Tinjau dan Putuskan', primary: true }));
  }
  if (['tu', 'superadmin'].includes(user.role)) {
    (d.antrian_tu || []).forEach((l) => items.push({ key: `t${l.id}`, kind: 'Belum diteruskan', tone: 'warn', title: l.perihal, no: l.no_agenda, meta: `${l.asal}, diterima ${fmtDate(l.tgl_diterima)}`, to: `/surat-masuk/${l.id}`, btn: 'Teruskan kepada Pimpinan', primary: true, run: () => act.forward.mutate(l.id) }));
  }
  (d.disposisi_baru || []).forEach((x) => items.push({ key: `db${x.id}`, kind: 'Disposisi baru', tone: 'warn', title: x.perihal, no: x.no_agenda, meta: `Dari ${x.dari}. ${x.instruksi}. Batas ${fmtDate(x.deadline)}`, to: `/surat-masuk/${x.letter_in_id}`, btn: 'Terima Disposisi', primary: true, run: () => act.accept.mutate(x.id) }));
  (d.tugas_terdekat || []).filter((t) => t.sla.level === 'late' || t.sla.level === 'warn').forEach((t) => items.push({ key: `tt${t.id}`, kind: t.sla.level === 'late' ? 'Tugas terlambat' : 'Tugas mendekati tenggat', tone: t.sla.level === 'late' ? 'late' : 'warn', title: t.judul, no: t.no_agenda, meta: t.sla.label, to: `/tugas/${t.id}`, btn: 'Perbarui Progres' }));
  return items;
}

function Inbox({ d, user }) {
  const accept = useAction((id) => post(`/dispositions/${id}/terima`), { success: 'Disposisi diterima', keys: ['dashboard', 'dispositions', 'letter'] });
  const forward = useAction((id) => post(`/letters-in/${id}/teruskan`), { success: 'Surat diteruskan kepada pimpinan', keys: ['dashboard', 'letters-in'] });
  const items = buildInbox(d, user, { accept, forward });
  const shown = items.slice(0, 8);
  return (
    <section className="section" aria-labelledby="inbox-h">
      <div className="section-title"><h2 id="inbox-h">Perlu tindakan Anda{items.length > 0 ? ` (${items.length})` : ''}</h2></div>
      <div className="card">
        {shown.length === 0 ? <Empty title="Tidak ada yang menunggu Anda" text="Pekerjaan baru muncul di sini dan di notifikasi." /> : (
          <div className="inbox">
            {shown.map((it) => (
              <div className="inbox-item" key={it.key}>
                <div className="inbox-main">
                  <span className={`kind ${it.tone || ''}`}>{it.kind}</span>
                  <Link to={it.to}>{it.title}</Link>
                  <span className="muted small">{it.no ? <><Stamp>{it.no}</Stamp> </> : null}{it.meta}</span>
                </div>
                {it.run ? <button type="button" className={`btn btn-sm ${it.primary ? 'btn-primary' : ''}`} onClick={it.run} disabled={accept.isPending || forward.isPending}>{it.btn}</button> : <Link className={`btn btn-sm ${it.primary ? 'btn-primary' : ''}`} to={it.to}>{it.btn}</Link>}
              </div>
            ))}
          </div>
        )}
        {items.length > shown.length && <div className="pager"><span className="muted small">{items.length - shown.length} lainnya tidak ditampilkan.</span><Link to="/surat-masuk">Buka daftar surat</Link></div>}
      </div>
    </section>
  );
}

function Charts({ d }) {
  return (
    <div className="split">
      <section className="section" aria-labelledby="grafik">
        <div className="section-title"><h2 id="grafik">Surat per bulan</h2><span className="muted small">Tahun berjalan</span></div>
        <div className="card card-pad"><Bars data={d.per_bulan} /></div>
      </section>
      <section className="section" aria-labelledby="unit">
        <div className="section-title"><h2 id="unit">Distribusi per unit</h2>{d.rata_hari_selesai != null && <span className="muted small">Rata-rata selesai {d.rata_hari_selesai} hari</span>}</div>
        <div className="card card-pad">
          {d.per_unit.length === 0 ? <p className="muted">Belum ada disposisi ke unit.</p> : d.per_unit.map((u) => (
            <div className="hbar" key={u.unit}><span>{u.unit}</span><span className="hbar-track"><span className="hbar-fill" style={{ width: `${(u.jumlah / d.per_unit[0].jumlah) * 100}%` }} /></span><span className="num">{u.jumlah}</span></div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function Dashboard() {
  const user = useUser();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard') });
  const leader = ['pimpinan', 'superadmin'].includes(user.role);
  return (
    <div className="page">
      <div className="hello">
        <h1>{greeting()}, {user.nama}</h1>
        <p className="date">{fmtDateLong()}. {user.roleLabel}{user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}</p>
      </div>
      <Async q={q} isEmpty={() => false} rows={5}>
        {(d) => (
          <>
            {user.role !== 'viewer' && <Inbox d={d} user={user} />}
            <section className="section" aria-labelledby="ringkas">
              <div className="section-title"><h2 id="ringkas">Posisi surat masuk</h2><span className="muted small">Surat yang dapat Anda lihat</span></div>
              <div className="ledger">
                <Fig to="/surat-masuk" n={d.counts.masuk_tahun_ini} cap="Surat masuk tahun ini" lead />
                <Fig to="/surat-masuk?status=MENUNGGU_DISPOSISI" n={d.counts.menunggu_disposisi} cap="Menunggu disposisi" />
                <Fig to="/surat-masuk?status=DIDISPOSISIKAN%2CSEDANG_DIPROSES%2CMENUNGGU_KONFIRMASI%2CMENUNGGU_PERSETUJUAN" n={d.counts.diproses} cap="Sedang diproses" />
                <Fig to="/surat-masuk?antrian=terlambat" n={d.counts.terlambat} cap="Terlambat" late />
                <Fig to="/surat-masuk?status=SELESAI%2CDIARSIPKAN" n={d.counts.selesai_bulan_ini} cap="Selesai bulan ini" />
              </div>
            </section>
            {d.tugas_saya && user.role !== 'pimpinan' && (
              <section className="section" aria-labelledby="tugas-h">
                <div className="section-title"><h2 id="tugas-h">Tugas saya</h2><Link to="/tugas">Lihat semua tugas</Link></div>
                <div className="ledger ledger-4">
                  <Fig to="/tugas?antrian=terlambat" n={d.tugas_saya.terlambat} cap="Terlambat" lead late />
                  <Fig to="/tugas?antrian=hari_ini" n={d.tugas_saya.hari_ini} cap="Jatuh tempo hari ini" />
                  <Fig to="/tugas?antrian=terbuka" n={d.tugas_saya.belum + d.tugas_saya.diproses + d.tugas_saya.menunggu_data + d.tugas_saya.menunggu_lain} cap="Terbuka" />
                  <Fig to="/tugas?scope=saya&status=SELESAI" n={d.tugas_saya.selesai} cap="Selesai" />
                </div>
              </section>
            )}
            {leader && <Charts d={d} />}
            {['tu', 'superadmin'].includes(user.role) && (
              <section className="section" aria-labelledby="tu-info">
                <div className="section-title"><h2 id="tu-info">Penomoran dan arsip</h2><Link to="/surat-masuk/baru" className="btn btn-primary btn-sm">Catat Surat Masuk</Link></div>
                <div className="card card-pad stack">
                  <div><div className="label">Nomor surat terakhir</div>{d.nomor_terakhir ? <Link to={`/surat-keluar/${d.nomor_terakhir.id}`} className="cell-title num">{d.nomor_terakhir.nomor_surat}</Link> : <span className="muted">Belum ada nomor yang diberikan</span>}</div>
                  <div><div className="label">Surat keluar menunggu</div><div className="muted">{d.keluar.menunggu_ttd} menunggu tanda tangan, {d.keluar.menunggu_kirim} menunggu pengiriman</div></div>
                </div>
              </section>
            )}
          </>
        )}
      </Async>
    </div>
  );
}
