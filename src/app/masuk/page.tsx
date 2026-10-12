import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { resolveSession } from '@/server/application/auth';
import { deps } from '@/server/container';
import { SESSION_COOKIE } from '@/server/http/handler';
import { Suspense } from 'react';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Masuk' };

export default async function LoginPage() {
  if (await resolveSession(deps(), (await cookies()).get(SESSION_COOKIE)?.value)) redirect('/');
  return <Suspense><LoginForm /></Suspense>;
}
