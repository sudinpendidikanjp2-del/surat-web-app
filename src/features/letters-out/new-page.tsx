'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Page, PageHeader, Section } from '@/components/app/page';
import { Async, Empty, Loading } from '@/components/app/states';
import { useAction } from '@/components/app/use-action';
import { useUser } from '@/components/app/user-context';
import { api } from '@/lib/api-client';
import { fmtDate, todayIso } from '@/lib/format';
import { useLetterIn, useUserOptions } from '@/features/letters-in/api';
import { useTemplate, useTemplates } from './api';
import { LetterForm, type LetterValues } from './letter-form';

/** Dua langkah: pilih jenis surat, lalu isi. Surat balasan sudah terisi dari surat masuknya. */
export function NewLetterOutPage() {
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
  const create = useAction((body: Record<string, unknown>) => api.post<{ id: number; no_agenda: string }>('/letters-out', body), {
    success: (r) => `Draf ${r.no_agenda} sudah tersimpan.`, keys: ['letters-out', 'dashboard', 'letter', 'timeline'], onDone: (r) => router.push(`/surat-keluar/${r.id}`),
  });
  const active = detail.data?.versions.find((v) => v.aktif);
  const l = dari ? src.data?.letter : undefined;
  const initial: LetterValues = {
    perihal: l ? `Tanggapan atas ${l.perihal}` : '',
    tujuan: l ? `${l.asal}${l.instansi ? `, ${l.instansi}` : ''}` : '',
    tgl_surat: todayIso(),
    penandatangan_id: signers.find((u) => u.role === 'pimpinan')?.id || null,
    fields: l ? { alamat_penerima: l.alamat || '', dasar_surat: `surat ${l.asal} nomor ${l.no_surat} tanggal ${fmtDate(l.tgl_surat)} perihal ${l.perihal}` } : ({} as Record<string, string>),
  };
  return (
    <Page>
      <PageHeader back={{ href: '/surat-keluar', label: 'Surat Keluar' }} title="Buat surat keluar"
        intro={l ? `Surat balasan untuk ${l.no_agenda}. Perihal, tujuan, dan dasar surat sudah terisi.` : 'Pilih jenis surat, isi formulirnya, lalu simpan sebagai draf.'} />
      <Section title="1. Pilih jenis surat">
        <Async q={templates} empty={<Empty title="Belum ada jenis surat" text={user.role === 'superadmin' ? 'Unggah template di menu Template Surat.' : 'Minta admin sistem menambahkan template surat.'} />}>
          {(rows) => (
            <div role="group" aria-label="Jenis surat" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((t) => {
                const on = String(t.id) === tplId;
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => setTplId(String(t.id))}
                    className={`pressable flex min-h-16 cursor-pointer flex-col items-start gap-0.5 rounded-lg border px-4 py-3 text-left ${on ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'border-border bg-card hover:bg-muted'}`}>
                    <span className="font-semibold">{t.nama}{on && <span className="sr-only"> (dipilih)</span>}</span>
                    {t.deskripsi && <span className="line-clamp-2 text-sm text-muted-foreground">{t.deskripsi}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Async>
      </Section>
      {tplId && (
        <Section title="2. Isi surat">
          {detail.isPending || (dari && src.isPending) || users.isPending ? <Loading /> : !active ? <Empty title="Template ini belum siap dipakai" /> : (
            <LetterForm key={`${tplId}-${l?.id || 0}-${signers.length}`} fields={active.fields} versionId={active.id} initial={initial} signers={signers}
              pending={create.isPending} submitLabel="Simpan sebagai draf"
              onSubmit={(f) => create.mutate({ ...f, template_version_id: active.id, letter_in_id: dari ? Number(dari) : null })}
              cancel={<Button asChild variant="outline" className="no-underline"><Link href="/surat-keluar">Batal</Link></Button>} />
          )}
        </Section>
      )}
    </Page>
  );
}
