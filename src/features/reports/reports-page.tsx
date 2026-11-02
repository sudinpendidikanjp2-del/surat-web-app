'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Field } from '@/components/app/form-field';
import { ExportMenu } from '@/components/app/data-table';
import { FilterButtons } from '@/components/app/list-controls';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Empty } from '@/components/app/states';
import { api, qs } from '@/lib/api-client';

const KINDS = [
  { value: 'surat-masuk', label: 'Surat masuk' },
  { value: 'surat-keluar', label: 'Surat keluar' },
  { value: 'disposisi', label: 'Disposisi' },
  { value: 'tindak-lanjut', label: 'Tugas' },
  { value: 'kinerja', label: 'Ketepatan waktu per unit' },
] as const;
type Kind = (typeof KINDS)[number]['value'];
interface Report { tables: { judul: string; columns: string[]; rows: (string | number | null)[][] }[]; catatan: string | null }
interface Stats { tahun: number; masuk: number; keluar: number; disposisi: number; selesai: number; terlambat: number }

export function ReportsPage() {
  const year = new Date().getFullYear();
  const [jenis, setJenis] = useState<Kind>('surat-masuk');
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const stat = useQuery({ queryKey: ['statistik'], queryFn: () => api.get<Stats>('/statistik') });
  const q = useQuery({ queryKey: ['laporan', jenis, from, to], queryFn: () => api.get<Report>(`/laporan/${jenis}${qs({ from, to })}`) });
  return (
    <Page>
      <PageHeader title="Laporan" intro="Rekap surat dan pekerjaan. Setiap tabel dapat diunduh untuk dibuka di Excel." />
      <Async q={stat} isEmpty={() => false}>
        {(s) => (
          <Section title={`Tahun ${s.tahun}`}>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-5">
              {([['Surat masuk', s.masuk], ['Surat keluar', s.keluar], ['Disposisi', s.disposisi], ['Selesai', s.selesai], ['Terlambat', s.terlambat]] as const).map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 bg-card px-4 py-3"><span className="text-sm text-muted-foreground">{k}</span><span className={`text-2xl font-bold tabular-nums ${k === 'Terlambat' && v ? 'text-late' : ''}`}>{v}</span></div>
              ))}
            </div>
          </Section>
        )}
      </Async>
      <Section title="Pilih laporan">
        <FilterButtons label="Jenis laporan" value={jenis} onChange={setJenis} options={[...KINDS]} />
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-4 shadow-(--shadow-card) sm:max-w-xl sm:grid-cols-2">
          <Field label="Dari tanggal" required>{(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Sampai tanggal" required>{(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
      </Section>
      <Async q={q} isEmpty={(d) => d.tables.every((t) => t.rows.length === 0)} empty={<Empty title="Tidak ada data pada rentang tanggal ini" text="Ubah tanggal di atas." />}>
        {(d) => (
          <div className="flex flex-col gap-8">
            {d.catatan && <p className="text-muted-foreground">{d.catatan}</p>}
            {d.tables.map((t, i) => (
              <Section key={t.judul} title={t.judul} action={<ExportMenu path={`/laporan/${jenis}`} params={{ from, to, tabel: i }} label="Unduh" />}>
                <Card><Table>
                  <TableHeader><TableRow>{t.columns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{t.rows.length === 0 ? <TableRow><TableCell colSpan={t.columns.length}>Tidak ada data</TableCell></TableRow> : t.rows.map((r, ri) => <TableRow key={ri}>{r.map((c, ci) => <TableCell key={ci} className={typeof c === 'number' ? 'tabular-nums' : ''}>{c ?? '-'}</TableCell>)}</TableRow>)}</TableBody>
                </Table></Card>
              </Section>
            ))}
          </div>
        )}
      </Async>
    </Page>
  );
}
