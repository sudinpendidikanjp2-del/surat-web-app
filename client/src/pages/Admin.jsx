import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { get, post, put, qs } from '../api.js';
import { Async, Empty, Field, Input, PageHead, Select, Sheet, Tag, useAction } from '../ui.jsx';
import { ListView, Pagination } from '../table.jsx';
import { fmtDateTime, ROLE_LABEL } from '../format.js';

function Foot({ close, pending, label, onSubmit }) {
  return (<><button type="button" className="btn" onClick={() => close()}>Batal</button><button type="button" className="btn btn-primary" disabled={pending} onClick={onSubmit}>{pending ? 'Menyimpan...' : label}</button></>);
}

function UserSheet({ user, units, onClose }) {
  const editing = Boolean(user);
  const [f, setF] = useState(user ? { ...user, password: '' } : { username: '', nama: '', nip: '', pangkat: '', jabatan: '', email: '', role: 'pelaksana', unit_id: '', password: '', aktif: true });
  const [err, setErr] = useState('');
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const body = () => ({ ...f, unit_id: f.unit_id ? Number(f.unit_id) : null });
  const act = useAction(() => (editing ? put(`/users/${user.id}`, body()) : post('/users', body())), { success: editing ? 'Pengguna diperbarui' : 'Pengguna dibuat', keys: ['users', 'user-options'] });
  return (
    <Sheet title={editing ? 'Ubah pengguna' : 'Tambah pengguna'} wide onClose={onClose} footer={({ close }) => <Foot close={close} pending={act.isPending} label="Simpan" onSubmit={() => { if (!f.nama.trim() || (!editing && (!f.username.trim() || f.password.length < 8))) return setErr('Nama, nama pengguna, dan kata sandi (minimal 8 karakter) wajib diisi'); setErr(''); act.mutate(undefined, { onSuccess: () => close() }); return undefined; }} />}>
      <div className="sheet-body">
        {err && <div className="alert alert-late" role="alert">{err}</div>}
        <div className="form-grid">
          <Field label="Nama lengkap">{(id) => <Input id={id} value={f.nama} onChange={s('nama')} />}</Field>
          <Field label="Nama pengguna" hint={editing ? 'Tidak dapat diubah' : 'Huruf kecil, angka, titik'}>{(id) => <Input id={id} value={f.username} onChange={s('username')} disabled={editing} autoCapitalize="none" />}</Field>
          <Field label="NIP">{(id) => <Input id={id} value={f.nip || ''} onChange={s('nip')} />}</Field>
          <Field label="Pangkat">{(id) => <Input id={id} value={f.pangkat || ''} onChange={s('pangkat')} />}</Field>
          <Field label="Jabatan">{(id) => <Input id={id} value={f.jabatan || ''} onChange={s('jabatan')} />}</Field>
          <Field label="Email">{(id) => <Input id={id} type="email" value={f.email || ''} onChange={s('email')} />}</Field>
          <Field label="Peran">{(id) => <Select id={id} value={f.role} onChange={s('role')} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} />}</Field>
          <Field label="Unit kerja">{(id) => <Select id={id} value={f.unit_id || ''} onChange={s('unit_id')} placeholder="Tanpa unit" options={units.map((u) => ({ value: u.id, label: u.nama }))} />}</Field>
          <Field label={editing ? 'Atur ulang kata sandi' : 'Kata sandi awal'} hint={editing ? 'Kosongkan jika tidak diubah. Sesi pengguna akan berakhir.' : 'Minimal 8 karakter'}>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.password} onChange={s('password')} />}</Field>
          {editing && <label className="check-row" style={{ alignSelf: 'end' }}><input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} /><span>Akun aktif</span></label>}
        </div>
      </div>
    </Sheet>
  );
}

const USER_FILTERS = [
  { key: 'role', label: 'Peran', type: 'multi', options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })) },
  { key: 'aktif', label: 'Status akun', type: 'select', options: [{ value: '1', label: 'Aktif' }, { value: '0', label: 'Nonaktif' }] },
];
const USER_DEFAULTS = { sort: 'nama', dir: 'asc' };

export function Users() {
  const units = useQuery({ queryKey: ['units'], queryFn: () => get('/units') });
  const [sheet, setSheet] = useState(null);
  const bulk = [
    { key: 'aktif', label: 'Aktifkan', url: '/users/bulk/aktif', body: { aktif: true } },
    { key: 'nonaktif', label: 'Nonaktifkan', tone: 'danger', url: '/users/bulk/aktif', body: { aktif: false }, confirm: { title: (n) => `Nonaktifkan ${n} akun?`, body: () => 'Akun yang dinonaktifkan langsung keluar dari sesi dan tidak dapat masuk. Akun Anda sendiri dilewati.', button: 'Nonaktifkan' } },
  ];
  const columns = [
    { key: 'nama', header: 'Nama', sort: 'nama', primary: true, title: (r) => r.nama, cell: (u) => (<><span className="cell-title">{u.nama}</span><div className="muted small">{u.jabatan}</div></>) },
    { key: 'username', header: 'Nama pengguna', sort: 'username', cell: (u) => u.username },
    { key: 'role', header: 'Peran', sort: 'role', cell: (u) => ROLE_LABEL[u.role] },
    { key: 'unit', header: 'Unit', sort: 'unit', cell: (u) => u.unit_nama || '-' },
    { key: 'aktif', header: 'Status', cell: (u) => (u.aktif ? <Tag tone="ok">Aktif</Tag> : <Tag tone="neutral">Nonaktif</Tag>) },
  ];
  return (
    <>
      <ListView
        title="Pengguna" sub="Akun, peran, dan unit kerja. Klik baris untuk mengubah."
        actions={<button type="button" className="btn btn-primary" onClick={() => setSheet({})}>Tambah Pengguna</button>}
        queryKey="users" endpoint="/users" idsEndpoint="/users/ids" filters={USER_FILTERS} columns={columns} bulk={bulk}
        onOpen={(u) => setSheet({ user: u })} defaults={USER_DEFAULTS} searchPlaceholder="Cari nama, nama pengguna, jabatan" labelOf={(id) => `Pengguna #${id}`}
        empty={<Empty title="Belum ada pengguna" />}
      />
      {sheet && <UserSheet user={sheet.user} units={units.data || []} onClose={() => setSheet(null)} />}
    </>
  );
}

function UnitSheet({ unit, onClose }) {
  const editing = Boolean(unit);
  const [f, setF] = useState(unit || { nama: '', kode: '', aktif: true });
  const act = useAction(() => (editing ? put(`/units/${unit.id}`, f) : post('/units', f)), { success: 'Unit disimpan', keys: ['units', 'users'] });
  return (
    <Sheet title={editing ? 'Ubah unit kerja' : 'Tambah unit kerja'} onClose={onClose} footer={({ close }) => <Foot close={close} pending={act.isPending} label="Simpan" onSubmit={() => act.mutate(undefined, { onSuccess: () => close() })} />}>
      <div className="sheet-body">
        <Field label="Nama unit">{(id) => <Input id={id} value={f.nama} onChange={(e) => setF({ ...f, nama: e.target.value })} />}</Field>
        <Field label="Kode unit" hint={editing ? 'Tidak dapat diubah' : 'Singkatan unik, misalnya DATA'}>{(id) => <Input id={id} value={f.kode} disabled={editing} onChange={(e) => setF({ ...f, kode: e.target.value })} />}</Field>
        {editing && <label className="check-row"><input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} /><span>Unit aktif</span></label>}
      </div>
    </Sheet>
  );
}

export function Units() {
  const q = useQuery({ queryKey: ['units'], queryFn: () => get('/units') });
  const [sheet, setSheet] = useState(null);
  return (
    <div className="page">
      <PageHead title="Unit kerja" sub="Unit tujuan disposisi dan dasar laporan kinerja."><button type="button" className="btn btn-primary" onClick={() => setSheet({})}>Tambah Unit</button></PageHead>
      <div className="card">
        <Async q={q} empty={<Empty title="Belum ada unit" />}>
          {(rows) => (
            <div className="table-wrap">
              <table className="table stackable">
                <thead><tr><th>Unit</th><th>Kode</th><th>Pengguna aktif</th><th>Status</th><th><span className="sr-only">Tindakan</span></th></tr></thead>
                <tbody>{rows.map((u) => (
                  <tr key={u.id}>
                    <td className="primary"><span className="cell-title">{u.nama}</span></td>
                    <td data-label="Kode">{u.kode}</td>
                    <td data-label="Pengguna aktif" className="num">{u.jumlah_pengguna}</td>
                    <td data-label="Status">{u.aktif ? <Tag tone="ok">Aktif</Tag> : <Tag tone="neutral">Nonaktif</Tag>}</td>
                    <td><button type="button" className="btn btn-sm" onClick={() => setSheet({ unit: u })}>Ubah</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
      {sheet && <UnitSheet unit={sheet.unit} onClose={() => setSheet(null)} />}
    </div>
  );
}

function SettingCard({ title, hint, children, onSave, pending }) {
  return (
    <form className="card card-pad stack" style={{ gap: 16 }} onSubmit={(e) => { e.preventDefault(); onSave(); }}>
      <div><h2>{title}</h2><p className="muted small" style={{ marginTop: 4 }}>{hint}</p></div>
      {children}
      <div><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Menyimpan...' : 'Simpan Pengaturan'}</button></div>
    </form>
  );
}

function SettingsForms({ s }) {
  const [inst, setInst] = useState(s.instansi);
  const [num, setNum] = useState(s.penomoran);
  const [sla, setSla] = useState(s.sla);
  const a = useAction(() => put('/settings/instansi', inst), { success: 'Data instansi disimpan', keys: ['settings'] });
  const b = useAction(() => put('/settings/penomoran', { ...num, digits: Number(num.digits) }), { success: 'Format nomor disimpan', keys: ['settings'] });
  const c = useAction(() => put('/settings/sla', Object.fromEntries(Object.entries(sla).map(([k, v]) => [k, Number(v)]))), { success: 'SLA disimpan', keys: ['settings'] });
  const example = num.format.replaceAll('{kode}', num.kode_default).replaceAll('{urut}', '1'.padStart(Number(num.digits) || 1, '0')).replaceAll('{unit}', inst.kode_unit).replaceAll('{bulan_romawi}', 'X').replaceAll('{bulan}', '10').replaceAll('{tahun}', String(new Date().getFullYear()));
  return (
    <div className="stack" style={{ gap: 20 }}>
      <SettingCard title="Data instansi" hint="Dipakai pada kop surat hasil template dan nomor surat." onSave={() => a.mutate()} pending={a.isPending}>
        <div className="form-grid">
          <Field label="Nama instansi pada kop" span2>{(id) => <Input id={id} value={inst.nama} onChange={(e) => setInst({ ...inst, nama: e.target.value })} />}</Field>
          <Field label="Alamat pada kop" span2>{(id) => <Input id={id} value={inst.alamat} onChange={(e) => setInst({ ...inst, alamat: e.target.value })} />}</Field>
          <Field label="Kota (tempat surat)">{(id) => <Input id={id} value={inst.kota} onChange={(e) => setInst({ ...inst, kota: e.target.value })} />}</Field>
          <Field label="Kode unit pada nomor">{(id) => <Input id={id} value={inst.kode_unit} onChange={(e) => setInst({ ...inst, kode_unit: e.target.value })} />}</Field>
        </div>
      </SettingCard>
      <SettingCard title="Penomoran surat keluar" hint="Nomor diberikan saat surat disetujui. Urutan naik otomatis per tahun dan tidak pernah ganda." onSave={() => b.mutate()} pending={b.isPending}>
        <div className="form-grid">
          <Field label="Format" hint="Gunakan {kode} {urut} {unit} {bulan_romawi} {bulan} {tahun}" span2>{(id) => <Input id={id} value={num.format} onChange={(e) => setNum({ ...num, format: e.target.value })} />}</Field>
          <Field label="Kode klasifikasi bawaan">{(id) => <Input id={id} value={num.kode_default} onChange={(e) => setNum({ ...num, kode_default: e.target.value })} />}</Field>
          <Field label="Jumlah digit nomor urut">{(id) => <Input id={id} type="number" min="1" max="8" value={num.digits} onChange={(e) => setNum({ ...num, digits: e.target.value })} />}</Field>
        </div>
        <p>Contoh hasil: <strong className="num">{example}</strong></p>
      </SettingCard>
      <SettingCard title="Target penyelesaian (SLA)" hint="Hari kerja dari tanggal diterima, menurut prioritas surat. Dipakai bila surat belum punya batas waktu disposisi." onSave={() => c.mutate()} pending={c.isPending}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {['Rendah', 'Normal', 'Tinggi', 'Mendesak'].map((k) => <Field key={k} label={`${k} (hari kerja)`}>{(id) => <Input id={id} type="number" min="1" max="60" value={sla[k]} onChange={(e) => setSla({ ...sla, [k]: e.target.value })} />}</Field>)}
        </div>
      </SettingCard>
    </div>
  );
}

export function Settings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => get('/settings') });
  return (
    <div className="page">
      <PageHead title="Pengaturan" sub="Data instansi, penomoran surat, dan target SLA." />
      <Async q={q} isEmpty={() => false} rows={5}>{(s) => <SettingsForms s={s} />}</Async>
    </div>
  );
}

export function AuditLog() {
  const [offset, setOffset] = useState(0);
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['audit', offset, text], queryFn: () => get(`/audit${qs({ offset, limit: 50, q: text })}`) });
  return (
    <div className="page">
      <PageHead title="Audit log" sub="Catatan aktivitas penting. Tidak dapat diubah atau dihapus oleh pengguna." />
      <div className="card card-pad"><Field label="Cari nomor, aksi, atau rincian">{(id) => <Input id={id} type="search" value={text} onChange={(e) => { setText(e.target.value); setOffset(0); }} />}</Field></div>
      <div className="card">
        <Async q={q} isEmpty={(d) => d.items.length === 0} empty={<Empty title="Tidak ada catatan yang cocok" />}>
          {(d) => (
            <>
              <div className="table-wrap">
                <table className="table stackable">
                  <thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Objek</th><th>Rincian</th></tr></thead>
                  <tbody>{d.items.map((a) => (
                    <tr key={a.id}>
                      <td className="primary num">{fmtDateTime(a.created_at)}</td>
                      <td data-label="Pengguna">{a.user_nama || 'Sistem'}</td>
                      <td data-label="Aksi"><Tag tone="neutral">{a.aksi}</Tag></td>
                      <td data-label="Objek">{a.entitas} {a.entitas_id}</td>
                      <td data-label="Rincian" className="small" style={{ overflowWrap: 'anywhere' }}>{Object.keys(a.detail || {}).length ? JSON.stringify(a.detail) : '-'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <Pagination page={Math.floor(offset / 50) + 1} pageSize={50} total={d.total} onPage={(p) => setOffset((p - 1) * 50)} onSize={() => {}} sizes={[50]} />
            </>
          )}
        </Async>
      </div>
    </div>
  );
}
