import { invalid, unauthenticated } from '@/domain/errors';
import { toPublicUser, type Actor } from '@/domain/roles';
import { str } from '@/domain/validation';
import { auditFor, type AnonCtx, type Ctx, type Deps } from './context';

const TEN_MIN = 10 * 60 * 1000;

/** Masuk. Mengembalikan pengguna publik dan token sesi mentah (disimpan sebagai cookie oleh lapisan HTTP). */
export async function login(d: Deps, ctx: AnonCtx, body: { username?: unknown; password?: unknown }) {
  const username = str(body.username, 'Nama pengguna', { max: 80 }).toLowerCase();
  d.limiter.hit(`login:${ctx.ip}|${username}`, TEN_MIN, 10);
  const password = str(body.password, 'Kata sandi', { max: 200 });
  return d.uow.run(async (r) => {
    const u = await r.users.findForLogin(username);
    // Verifikasi tetap dijalankan walau pengguna tidak ada agar waktu respons seragam.
    const ok = u ? await d.passwords.verify(password, u.password_hash) : await d.passwords.verify(password, 'scrypt$00$00');
    if (!u || !u.aktif || !ok) {
      await r.journal.audit({ userId: u?.id ?? null, ip: ctx.ip, aksi: 'LOGIN_GAGAL', entitas: 'user', entitasId: username, detail: {} });
      throw unauthenticated('Nama pengguna atau kata sandi salah');
    }
    const token = d.tokens.create();
    await r.sessions.create(d.tokens.hash(token), u.id, d.sessionHours);
    await r.journal.audit({ userId: u.id, ip: ctx.ip, aksi: 'LOGIN', entitas: 'user', entitasId: u.id, detail: {} });
    return { user: toPublicUser(u), token };
  });
}

/** Pengguna aktif dari token cookie, atau null. */
export async function resolveSession(d: Deps, token: string | undefined): Promise<Actor | null> {
  if (!token) return null;
  return d.uow.read.sessions.findActor(d.tokens.hash(token));
}

export async function logout(d: Deps, ctx: Ctx, token: string) {
  await d.uow.run(async (r) => {
    await r.sessions.delete(d.tokens.hash(token));
    await auditFor(r, ctx, 'LOGOUT', 'user', ctx.actor.id);
  });
}

export async function changePassword(d: Deps, ctx: Ctx, token: string, body: { lama?: unknown; baru?: unknown }) {
  const lama = str(body.lama, 'Kata sandi lama', { max: 200 });
  const baru = str(body.baru, 'Kata sandi baru', { max: 200 });
  if (baru.length < 8) throw invalid('Kata sandi baru minimal 8 karakter');
  await d.uow.run(async (r) => {
    const hash = await r.users.passwordHash(ctx.actor.id);
    if (!hash || !(await d.passwords.verify(lama, hash))) throw invalid('Kata sandi lama salah');
    await r.users.setPasswordHash(ctx.actor.id, await d.passwords.hash(baru));
    // Sesi lain (perangkat lain) dikeluarkan; sesi ini tetap.
    await r.sessions.deleteOthers(ctx.actor.id, d.tokens.hash(token));
    await auditFor(r, ctx, 'UBAH_PASSWORD', 'user', ctx.actor.id);
  });
}
