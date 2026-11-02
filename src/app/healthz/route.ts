/** Proses hidup. Untuk orkestrator atau load balancer; tidak menyentuh database. */
export const GET = () => Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
export const dynamic = 'force-dynamic';
