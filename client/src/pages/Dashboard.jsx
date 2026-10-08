import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { get, post } from '../api.js';
import { useUser } from '../auth.jsx';
import { Async, Sla, Stamp, StatusTask, useAction, Empty } from '../ui.jsx';
import { fmtDate, fmtDateLong, greeting } from '../format.js';

const Fig = ({ to, n, cap, lead, late }) => {
  const inner = (
    <>
      <span className="figure">{n ?? 0}</span>
      <span className="cap">{cap}</span>
    </>
  );
  const cls = `ledger-item${lead ? ' lead' : ''}${late && n > 0 ? ' is-late' : ''}`;
  return to ? <Link to={to} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
};

function Bars({ data }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.masuk, d.selesai]));
  return (
    <figure style={{ margin: 0 }}>
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

function Leader({ d }) {
  const telat = d.counts.terlambat;
  return (
    <>
      <section className="section" aria-labelledby="perhatian">
        <div className="section-title"><h2 id="perhatian">Pusat perhatian</h2></div>
        <div className="attention">
          <div className="card card-pad att-col">
            <h3>Perlu tindakan segera</h3>
            <ul className="att-list">
              <li><Link to="/surat-masuk?antrian=terlambat"><span className="cell-title">{telat} surat terlambat</span></Link></li>
              <li><Link to="/tugas"><span className="cell-title">{d.tugas_terlambat} tugas terlambat</span></Link></li>
              <li><Link to="/surat-masuk"><span className="cell-title">{d.counts.jatuh_tempo_hari_ini} surat jatuh tempo hari ini</span></Link></li>
            </ul>
          </div>
          <div className="card card-pad att-col">
            <h3>Perlu perhatian</h3>
            <ul className="att-list">
              <li><Link to="/surat-masuk"><span className="cell-title">{d.counts.mendekati} surat mendekati tenggat</span></Link></li>
              <li><Link to="/tugas"><span className="cell-title">{d.tugas_mendekati} tugas mendekati tenggat</span></Link></li>
              <li><Link to="/surat-masuk"><span className="cell-title">{d.counts.menunggu_konfirmasi} surat menunggu konfirmasi</span></Link></li>
            </ul>
          </div>
          <div className="card card-pad att-col">
            <h3>Menunggu keputusan</h3>
            <ul className="att-list">
              <li><Link to="/surat-masuk?status=MENUNGGU_DISPOSISI"><span className="cell-title">{d.counts.menunggu_disposisi} surat menunggu disposisi</span></Link></li>
              <li><Link to="/surat-keluar?antrian=menunggu_saya"><span className="cell-title">{d.keluar.menunggu_persetujuan} surat keluar menunggu persetujuan</span></Link></li>
              <li><Link to="/surat-masuk"><span className="cell-title">{d.counts.selesai_minggu_ini} surat selesai minggu ini</span></Link></li>
            </ul>
          </div>
        </div>
      </section>

      <div className="split">
        <section className="section" aria-labelledby="antri-disposisi">
          <div className="section-title"><h2 id="antri-disposisi">Menunggu disposisi Anda</h2></div>
          <div className="card">
            {d.perlu_disposisi.length === 0 ? <Empty title="Tidak ada surat menunggu disposisi" text="Surat yang diteruskan Tata Usaha akan muncul di sini." /> : (
              <ul className="att-list" style={{ padding: '0 20px' }}>
                {d.perlu_disposisi.map((l) => (
                  <li key={l.id}><Link to={`/surat-masuk/${l.id}`}><span><Stamp>{l.no_agenda}</Stamp></span><span className="cell-title">{l.perihal}</span><span className="muted small">{l.asal}, {l.sifat}, diterima {fmtDate(l.tgl_diterima)}</span></Link></li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="section" aria-labelledby="antri-setuju">
          <div className="section-title"><h2 id="antri-setuju">Menunggu persetujuan</h2></div>
          <div className="card">
            {d.perlu_persetujuan.length === 0 ? <Empty title="Tidak ada surat keluar menunggu" /> : (
              <ul className="att-list" style={{ padding: '0 20px' }}>
                {d.perlu_persetujuan.map((l) => (
                  <li key={l.id}><Link to={`/surat-keluar/${l.id}`}><span><Stamp>{l.no_agenda}</Stamp></span><span className="cell-title">{l.perihal}</span><span className="muted small">{l.jenis}, dibuat {l.pembuat}</span></Link></li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="split">
        <section className="section" aria-labelledby="grafik">
          <div className="section-title"><h2 id="grafik">Surat per bulan</h2><span className="muted small">Tahun berjalan</span></div>
          <div className="card card-pad"><Bars data={d.per_bulan} /></div>
        </section>
        <section className="section" aria-labelledby="unit">
          <div className="section-title"><h2 id="unit">Distribusi per unit</h2>{d.rata_hari_selesai != null && <span className="muted small">Rata-rata selesai {d.rata_hari_selesai} hari</span>}</div>
          <div className="card card-pad">
            {d.per_unit.length === 0 ? <p className="muted">Belum ada disposisi ke unit.</p> : d.per_unit.map((u) => (
              <div className="hbar" key={u.unit}>
                <span>{u.unit}</span>
                <span className="hbar-track"><span className="hbar-fill" style={{ width: `${(u.jumlah / d.per_unit[0].jumlah) * 100}%`, display: 'block' }} /></span>
                <span className="num">{u.jumlah}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Tu({ d }) {
  return (
    <div className="split">
      <section className="section" aria-labelledby="belum-teruskan">
        <div className="section-title"><h2 id="belum-teruskan">Belum diteruskan kepada pimpinan</h2><Link to="/surat-masuk/baru" className="btn btn-primary btn-sm">Catat Surat Masuk</Link></div>
        <div className="card">
          {d.antrian_tu.length === 0 ? <Empty title="Semua surat sudah diteruskan" text="Catat surat baru yang diterima hari ini dengan tombol di atas." /> : (
            <ul className="att-list" style={{ padding: '0 20px' }}>
              {d.antrian_tu.map((l) => (
                <li key={l.id}><Link to={`/surat-masuk/${l.id}`}><span><Stamp>{l.no_agenda}</Stamp></span><span className="cell-title">{l.perihal}</span><span className="muted small">{l.asal}, diterima {fmtDate(l.tgl_diterima)}</span></Link></li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="section" aria-labelledby="tu-info">
        <div className="section-title"><h2 id="tu-info">Penomoran dan arsip</h2></div>
        <div className="card card-pad stack">
          <div>
            <div className="label">Nomor surat terakhir</div>
            {d.nomor_terakhir ? <Link to={`/surat-keluar/${d.nomor_terakhir.id}`} className="cell-title num">{d.nomor_terakhir.nomor_surat}</Link> : <span className="muted">Belum ada nomor yang diberikan</span>}
          </div>
          <div>
            <div className="label">Surat keluar menunggu</div>
            <div className="muted">{d.keluar.menunggu_ttd} menunggu tanda tangan, {d.keluar.menunggu_kirim} menunggu pengiriman</div>
          </div>
          <div>
            <div className="label">Arsip terbaru</div>
            {d.arsip_terbaru.length === 0 ? <span className="muted">Belum ada surat diarsipkan</span> : d.arsip_terbaru.map((a) => <div key={a.id}><Link to={`/surat-masuk/${a.id}`}>{a.no_agenda}</Link> <span className="muted small">{a.perihal}</span></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}

function MyWork({ d }) {
  const t = d.tugas_saya;
  const accept = useAction((id) => post(`/dispositions/${id}/terima`), { success: 'Disposisi diterima', keys: ['dashboard', 'dispositions', 'letter'] });
  return (
    <>
      <section className="section" aria-labelledby="pekerjaan">
        <div className="section-title"><h2 id="pekerjaan">Pekerjaan saya</h2><Link to="/tugas">Lihat semua tugas</Link></div>
        <div className="ledger" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
          <Fig to="/tugas" n={t.urgent} cap="Mendesak atau terlambat" lead late />
          <Fig to="/tugas" n={t.hari_ini} cap="Jatuh tempo hari ini" />
          <Fig to="/tugas" n={t.minggu_ini} cap="Minggu ini" />
          <Fig to="/tugas" n={t.menunggu_data + t.menunggu_lain} cap="Menunggu pihak lain" />
          <Fig to="/tugas" n={t.selesai} cap="Selesai" />
        </div>
      </section>
      <div className="split">
        <section className="section" aria-labelledby="disp-baru">
          <div className="section-title"><h2 id="disp-baru">Disposisi baru untuk Anda</h2></div>
          <div className="card">
            {d.disposisi_baru.length === 0 ? <Empty title="Tidak ada disposisi baru" /> : (
              <ul className="att-list" style={{ padding: '0 20px' }}>
                {d.disposisi_baru.map((x) => (
                  <li key={x.id} style={{ padding: '10px 0' }}>
                    <Link to={`/surat-masuk/${x.letter_in_id}`} style={{ padding: 0 }}><span><Stamp>{x.no_agenda}</Stamp></span><span className="cell-title">{x.perihal}</span><span className="muted small">Dari {x.dari}. {x.instruksi}</span></Link>
                    <div className="row" style={{ marginTop: 8 }}><span className="small muted">Batas {fmtDate(x.deadline)}</span><button type="button" className="btn btn-sm btn-primary" disabled={accept.isPending} onClick={() => accept.mutate(x.id)}>Terima Disposisi</button></div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        <section className="section" aria-labelledby="tugas-dekat">
          <div className="section-title"><h2 id="tugas-dekat">Tenggat terdekat</h2></div>
          <div className="card">
            {d.tugas_terdekat.length === 0 ? <Empty title="Tidak ada tugas terbuka" /> : (
              <ul className="att-list" style={{ padding: '0 20px' }}>
                {d.tugas_terdekat.map((x) => (
                  <li key={x.id}><Link to={`/tugas/${x.id}`}><span className="cell-title">{x.judul}</span><span className="row" style={{ gap: 10 }}><StatusTask status={x.status} /><Sla sla={x.sla} /><span className="muted small">{x.progress}%</span></span></Link></li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

export default function Dashboard() {
  const user = useUser();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard') });
  return (
    <div className="page">
      <div className="hello">
        <h1>{greeting()}, {user.nama}</h1>
        <p className="date">{fmtDateLong()}. {user.roleLabel}{user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}</p>
      </div>
      <Async q={q} isEmpty={() => false} rows={5}>
        {(d) => (
          <>
            <section className="section" aria-labelledby="ringkas">
              <div className="section-title"><h2 id="ringkas">Posisi surat masuk</h2><span className="muted small">Sesuai surat yang dapat Anda lihat</span></div>
              <div className="ledger">
                <Fig to="/surat-masuk" n={d.counts.masuk_tahun_ini} cap="Surat masuk tahun ini" lead />
                <Fig to="/surat-masuk?status=MENUNGGU_DISPOSISI" n={d.counts.menunggu_disposisi} cap="Menunggu disposisi" />
                <Fig to="/surat-masuk" n={d.counts.diproses} cap="Sedang diproses" />
                <Fig to="/surat-masuk?antrian=terlambat" n={d.counts.terlambat} cap="Terlambat" late />
                <Fig to="/surat-masuk" n={d.counts.selesai_bulan_ini} cap="Selesai bulan ini" />
              </div>
            </section>
            {['pimpinan', 'superadmin'].includes(user.role) && <Leader d={d} />}
            {['tu', 'superadmin'].includes(user.role) && <Tu d={d} />}
            {d.tugas_saya && !['pimpinan'].includes(user.role) && <MyWork d={d} />}
          </>
        )}
      </Async>
    </div>
  );
}
