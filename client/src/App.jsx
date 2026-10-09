import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from './api.js';
import { AuthCtx, can } from './auth.jsx';
import { Icon, Loading, Empty, useAction, useToast } from './ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import { LettersIn } from './pages/LettersIn.jsx';
import { LetterInNew } from './pages/LetterInNew.jsx';
import LetterInDetail from './pages/LetterInDetail.jsx';
import DispositionSheet from './pages/DispositionSheet.jsx';
import { Dispositions } from './pages/Dispositions.jsx';
import { Tasks, TaskDetail } from './pages/Tasks.jsx';
import { LettersOut, LetterOutNew } from './pages/LettersOut.jsx';
import LetterOutDetail from './pages/LetterOutDetail.jsx';
import { Templates, TemplateDetail } from './pages/Templates.jsx';
import { Archive, Search } from './pages/Search.jsx';
import Reports from './pages/Reports.jsx';
import { Users, Units, Settings, AuditLog } from './pages/Admin.jsx';
import Notifications from './pages/Notifications.jsx';
import { ChangePassword } from './pages/Profile.jsx';
import Track from './pages/Track.jsx';

function useTheme() {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('tema'); } catch { return null; }
  });
  const effective = theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const toggle = () => {
    const next = effective === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('tema', next); } catch { /* penyimpanan tidak tersedia */ }
    setTheme(next);
  };
  return [effective, toggle];
}

function Shell({ user }) {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [q, setQ] = useState('');
  const [pw, setPw] = useState(false);
  const notif = useQuery({ queryKey: ['notif-count'], queryFn: () => get('/notifications'), refetchInterval: 30000 });
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: () => get('/dashboard') });
  const logout = useAction(() => post('/auth/logout'), { onDone: () => { qc.clear(); qc.setQueryData(['me'], null); nav('/'); } });

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);

  const groups = useMemo(() => {
    const d = dash.data;
    const g = [{ items: [{ to: '/', label: 'Dashboard', end: true }] }];
    g.push({
      title: 'Persuratan',
      items: [
        { to: '/surat-masuk', label: 'Surat Masuk', count: d?.counts?.menunggu_disposisi && ['pimpinan', 'superadmin'].includes(user.role) ? d.counts.menunggu_disposisi : d?.counts?.belum_diteruskan && user.role === 'tu' ? d.counts.belum_diteruskan : 0 },
        ...(can.pekerjaan(user) ? [{ to: '/disposisi', label: 'Disposisi', count: d?.disposisi_baru?.length || 0 }, { to: '/tugas', label: 'Tugas Saya', count: d?.tugas_saya?.urgent || 0 }] : []),
        { to: '/surat-keluar', label: 'Surat Keluar', count: ['pimpinan', 'superadmin'].includes(user.role) ? d?.keluar?.menunggu_persetujuan || 0 : 0 },
        { to: '/arsip', label: 'Arsip' },
      ],
    });
    if (can.tulisKeluar(user)) g.push({ title: 'Pembuatan Surat', items: [{ to: '/surat-keluar/baru', label: 'Buat Surat' }, { to: '/template', label: 'Template' }] });
    g.push({ title: 'Monitoring', items: [{ to: '/cari', label: 'Pencarian' }, ...(can.laporan(user) ? [{ to: '/laporan', label: 'Laporan' }] : [])] });
    const adm = [];
    if (can.admin(user)) adm.push({ to: '/pengguna', label: 'Pengguna' }, { to: '/unit', label: 'Unit Kerja' }, { to: '/pengaturan', label: 'Pengaturan' });
    if (can.audit(user)) adm.push({ to: '/audit', label: 'Audit Log' });
    if (adm.length) g.push({ title: 'Administrasi', items: adm });
    return g;
  }, [dash.data, user]);

  const submitSearch = (e) => {
    e.preventDefault();
    nav(`/cari${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  };

  return (
    <div className="shell">
      <a className="skip" href="#isi">Lewati ke konten</a>
      <aside className="sidebar" data-open={open} aria-label="Navigasi utama">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M5 7h14M5 12h14M5 17h9" /></svg></span>
          <span className="brand-name">Sistem Surat<span className="brand-sub">Disposisi dan tindak lanjut</span></span>
        </Link>
        <nav>
          {groups.map((g, i) => (
            <div key={i}>
              {g.title && <div className="nav-group">{g.title}</div>}
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end || it.to === '/surat-keluar'} className="nav-link">
                  <span>{it.label}</span>
                  {it.count > 0 && <span className="nav-count" aria-label={`${it.count} perlu perhatian`}>{it.count}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="small muted" style={{ padding: '0 10px 8px' }}>
            <strong style={{ color: 'var(--ink)' }}>{user.nama}</strong><br />{user.roleLabel}{user.unitNama && user.unitNama !== user.roleLabel ? `, ${user.unitNama}` : ''}
          </div>
          <button type="button" className="nav-link" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => { setPw(true); setOpen(false); }}>Ubah kata sandi</button>
          <button type="button" className="nav-link" style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', font: 'inherit' }} onClick={() => logout.mutate()}>Keluar</button>
        </div>
      </aside>
      <div className="scrim-nav" data-open={open} onClick={() => setOpen(false)} aria-hidden="true" />
      <div className="main">
        <header className="topbar">
          <button type="button" className="btn btn-quiet icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Buka menu" aria-expanded={open}><Icon name="menu" /></button>
          <form className="topbar-search" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={18} />
            <label className="sr-only" htmlFor="cari-global">Cari surat</label>
            <input id="cari-global" className="input" type="search" placeholder="Cari nomor, perihal, pengirim" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <span className="topbar-spacer" />
          <button type="button" className="btn btn-quiet icon-btn" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
          <Link to="/notifikasi" className="btn btn-quiet icon-btn" aria-label={`Notifikasi, ${notif.data?.unread || 0} belum dibaca`}>
            <Icon name="bell" />
            {notif.data?.unread > 0 && <span className="badge-dot" aria-hidden="true">{notif.data.unread > 99 ? '99+' : notif.data.unread}</span>}
          </Link>
        </header>
        <main id="isi" tabIndex={-1}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/surat-masuk" element={<LettersIn />} />
            <Route path="/surat-masuk/baru" element={<Guard ok={can.kelolaIn(user)}><LetterInNew /></Guard>} />
            <Route path="/surat-masuk/:id" element={<LetterInDetail />} />
            <Route path="/surat-masuk/:id/cetak" element={<DispositionSheet />} />
            <Route path="/disposisi" element={<Guard ok={can.pekerjaan(user)}><Dispositions /></Guard>} />
            <Route path="/tugas" element={<Guard ok={can.pekerjaan(user)}><Tasks /></Guard>} />
            <Route path="/tugas/:id" element={<TaskDetail />} />
            <Route path="/surat-keluar" element={<LettersOut />} />
            <Route path="/surat-keluar/baru" element={<Guard ok={can.tulisKeluar(user)}><LetterOutNew /></Guard>} />
            <Route path="/surat-keluar/:id" element={<LetterOutDetail />} />
            <Route path="/template" element={<Guard ok={can.tulisKeluar(user)}><Templates /></Guard>} />
            <Route path="/template/:id" element={<Guard ok={can.tulisKeluar(user)}><TemplateDetail /></Guard>} />
            <Route path="/arsip" element={<Archive />} />
            <Route path="/cari" element={<Search />} />
            <Route path="/laporan" element={<Guard ok={can.laporan(user)}><Reports /></Guard>} />
            <Route path="/pengguna" element={<Guard ok={can.admin(user)}><Users /></Guard>} />
            <Route path="/unit" element={<Guard ok={can.admin(user)}><Units /></Guard>} />
            <Route path="/pengaturan" element={<Guard ok={can.admin(user)}><Settings /></Guard>} />
            <Route path="/audit" element={<Guard ok={can.audit(user)}><AuditLog /></Guard>} />
            <Route path="/notifikasi" element={<Notifications />} />
            <Route path="/s/:token" element={<QrRedirect />} />
            <Route path="*" element={<div className="page"><Empty title="Halaman tidak ditemukan" text="Alamat yang Anda buka tidak ada di aplikasi ini." action={<Link className="btn btn-primary" to="/">Kembali ke Dashboard</Link>} /></div>} />
          </Routes>
        </main>
      </div>
      {pw && <ChangePassword onClose={() => setPw(false)} />}
    </div>
  );
}

function Guard({ ok, children }) {
  if (ok) return children;
  return <div className="page"><Empty title="Akses tidak tersedia" text="Peran Anda tidak memiliki izin untuk halaman ini." action={<Link className="btn" to="/">Kembali ke Dashboard</Link>} /></div>;
}

function QrRedirect() {
  const { pathname } = useLocation();
  const token = pathname.split('/').pop();
  const q = useQuery({ queryKey: ['qr', token], queryFn: () => get(`/qr/${token}`) });
  if (q.isLoading) return <div className="page"><Loading /></div>;
  if (q.isError) return <div className="page"><Empty title="Kode surat tidak dikenal" text={q.error.message} /></div>;
  return <Navigate to={`/surat-masuk/${q.data.id}`} replace />;
}

function AuthedApp() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => get('/auth/me').then((r) => r.user), staleTime: Infinity });
  if (me.isLoading) return <div className="page"><Loading /></div>;
  if (!me.data) return <Login />;
  return <AuthCtx.Provider value={me.data}><Shell user={me.data} /></AuthCtx.Provider>;
}

/** Halaman pelacakan publik berada di luar login dan kerangka aplikasi. */
export default function App() {
  const { pathname } = useLocation();
  if (pathname === '/lacak' || pathname.startsWith('/lacak/')) {
    return <Routes><Route path="/lacak" element={<Track />} /><Route path="/lacak/:code" element={<Track />} /></Routes>;
  }
  return <AuthedApp />;
}
