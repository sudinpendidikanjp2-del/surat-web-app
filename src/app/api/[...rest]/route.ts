import { json, route } from '@/server/http/handler';


const notFound = route(async () => json({ error: 'Alamat API tidak ditemukan' }, 404), { auth: false });
export { notFound as GET, notFound as POST, notFound as PUT, notFound as DELETE };

export const dynamic = 'force-dynamic';
