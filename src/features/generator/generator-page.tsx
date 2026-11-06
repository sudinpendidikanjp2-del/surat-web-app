'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Empty, Loading } from '@/components/app/states';
import { useUser } from '@/components/app/user-context';
import { can } from '@/domain/roles';
import { fmtDate, todayIso } from '@/lib/format';
import { useLetterIn, useUserOptions } from '@/features/letters-in/api';
import { useTemplate, useTemplates } from '@/features/templates/api';
import { LetterForm, type LetterValues } from './letter-form';

/**
 * Buat Surat: pilih template, isi sambil melihat hasilnya, lalu unduh Word atau PDF untuk dicetak dan ditandatangani.
 * Tidak ada yang disimpan di sini. Setelah ditandatangani, surat dicatat di Surat Keluar (tombol di bawah formulir
 * membawa perihal, tujuan, tanggal, dan nomor ke formulir pencatatan). Admin mengelola template dari halaman ini.
 */
export function GeneratorPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const dari = sp.get('dari');
  const user = useUser();
  const templates = useTemplates();
  const [tplId, setTplId] = useState<string>(sp.get('template') || '');
  const detail = useTemplate(tplId || null);
  const src = useLetterIn(dari || '', Boolean(dari));
  const users = useUserOptions();
  const signers = useMemo(() => (users.data || []).filter((u) => ['pimpinan', 'pejabat', 'superadmin'].includes(u.role)), [users.data]);
  const active = detail.data?.versions.find((v) => v.aktif);
  const l = dari ? src.data?.letter : undefined;
  const initial: LetterValues = {
    perihal: l ? `Tanggapan atas ${l.perihal}` : '',
    tujuan: l ? `${l.asal}${l.instansi ? `, ${l.instansi}` : ''}` : '',
    tgl_surat: todayIso(),
    nomor_surat: '',
    penandatangan_id: signers.find((u) => u.role === 'pimpinan')?.id || null,
    fields: l ? { alamat_penerima: l.alamat || '', dasar_surat: `surat ${l.asal} nomor ${l.no_surat} tanggal ${fmtDate(l.tgl_surat)} perihal ${l.perihal}` } : ({} as Record<string, string>),
  };
  /** Lanjut mencatat: isian yang sudah diketik dibawa ke formulir Catat Surat Keluar. */
  const toRecord = (f: LetterValues) => {
    const p = new URLSearchParams({ perihal: f.perihal, tujuan: f.tujuan, tgl: f.tgl_surat, jenis: detail.data?.template.jenis || '' });
    if (f.nomor_surat) p.set('nomor', f.nomor_surat);
    if (f.penandatangan_id) p.set('penandatangan', String(f.penandatangan_id));
    if (dari) p.set('dari', dari);
    router.push(`/surat-keluar/baru?${p}`);
  };
  return (
    <Page wide>
      <PageHeader title="Buat Surat"
        intro={l ? `Surat balasan untuk ${l.no_agenda}. Perihal, tujuan, dan dasar surat sudah terisi.` : 'Pilih template, isi sambil melihat hasilnya, lalu unduh Word atau PDF untuk dicetak dan ditandatangani. Setelah ditandatangani, catat di Surat Keluar.'}>
        {can.admin(user) && <Button asChild variant="outline"><Link href="/buat-surat/template"><SettingsIcon aria-hidden /> Kelola Template</Link></Button>}
      </PageHeader>
      <Section title="1. Pilih template">
        <Async q={templates} empty={<Empty title="Belum ada template" text={can.admin(user) ? 'Tambahkan template lewat tombol Kelola Template.' : 'Minta admin sistem menambahkan template surat.'} />}>
          {(rows) => (
            <div role="group" aria-label="Template surat" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {rows.filter((t) => t.aktif && t.versi_aktif_id).map((t) => {
                const on = String(t.id) === tplId;
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => setTplId(String(t.id))}
                    className={`pressable flex min-h-24 cursor-pointer flex-col items-start gap-1 rounded-2xl border p-4 text-left shadow-(--shadow-card) ${on ? 'border-primary bg-accent-soft ring-2 ring-primary' : 'border-border bg-card hover:border-strong'}`}>
                    <span className="flex w-full items-center justify-between gap-2"><span className="text-xs font-semibold text-muted-foreground">{t.jenis}</span>{on && <span className="rounded-full bg-primary px-2 text-xs font-semibold text-primary-foreground">Dipilih</span>}</span>
                    <span className="font-semibold">{t.nama}</span>
                    {t.deskripsi && <span className="line-clamp-2 text-sm text-muted-foreground">{t.deskripsi}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Async>
      </Section>
      {tplId && (
        <Section title="2. Isi surat, lihat hasilnya, lalu unduh" intro="Cetak dan tanda tangani hasil unduhan. Tombol di bawah formulir membawa isian ini ke pencatatan surat keluar.">
          {detail.isPending || (dari && src.isPending) || users.isPending ? <Loading /> : !active ? <Empty title="Template ini belum siap dipakai" /> : (
            <LetterForm key={`${tplId}-${l?.id || 0}-${signers.length}`} fields={active.fields} versionId={active.id} initial={initial} signers={signers}
              pending={false} submitLabel="Sudah Ditandatangani? Catat Surat Keluar" onSubmit={toRecord} />
          )}
        </Section>
      )}
    </Page>
  );
}
