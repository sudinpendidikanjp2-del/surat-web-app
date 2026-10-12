/** Hook awal Next.js. Hanya berjalan di runtime Node (bukan edge). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { boot } = await import('./server/boot');
    await boot();
  }
}
