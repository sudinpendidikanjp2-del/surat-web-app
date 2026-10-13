'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export type ThemeChoice = 'sistem' | 'terang' | 'gelap';
const KEY = 'surat-tema';

/**
 * Dijalankan sebelum halaman tampil (lihat layout) agar tidak berkedip terang lalu gelap.
 * Ditulis sebagai teks karena disisipkan apa adanya ke <head>.
 */
export const themeBootScript = `(function(){try{var c=localStorage.getItem('${KEY}')||'sistem';var d=c==='gelap'||(c==='sistem'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){document.documentElement.dataset.theme='light';}})();`;

const readChoice = (): ThemeChoice => {
  try { const v = localStorage.getItem(KEY); return v === 'terang' || v === 'gelap' ? v : 'sistem'; } catch { return 'sistem'; }
};
const systemDark = () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;

interface ThemeState { choice: ThemeChoice; resolved: 'light' | 'dark'; setChoice: (c: ThemeChoice) => void }
const Ctx = createContext<ThemeState>({ choice: 'sistem', resolved: 'light', setChoice: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>('sistem');
  // null sampai hidrasi selesai: tema yang sudah dipasang skrip awal tidak ditimpa lebih dulu.
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    // Nilai awal dari penyimpanan dan sistem hanya ada di peramban; disinkronkan sekali setelah hidrasi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoiceState(readChoice());
    setDark(systemDark());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const resolved: 'light' | 'dark' = choice === 'gelap' || (choice === 'sistem' && dark) ? 'dark' : 'light';
  useEffect(() => {
    if (dark === null) return;
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1b1f1c' : '#ffffff');
  }, [resolved, dark]);
  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try { localStorage.setItem(KEY, c); } catch { /* mode privat: pilihan berlaku sampai halaman ditutup */ }
  }, []);
  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

const LABEL: Record<ThemeChoice, string> = { sistem: 'Ikuti perangkat', terang: 'Terang', gelap: 'Gelap' };

/** Pilihan tampilan di kepala halaman. Ikon menunjukkan tema yang sedang aktif. */
export function ThemeMenu() {
  const { choice, resolved, setChoice } = useTheme();
  const Icon = choice === 'sistem' ? MonitorIcon : resolved === 'dark' ? MoonIcon : SunIcon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Tampilan: ${LABEL[choice]}`}><Icon className="size-[18px]" aria-hidden /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Tampilan</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
          {(Object.keys(LABEL) as ThemeChoice[]).map((k) => <DropdownMenuRadioItem key={k} value={k}>{LABEL[k]}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
