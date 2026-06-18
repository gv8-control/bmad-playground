import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL('/sign-in', req.url);
    return Response.redirect(signInUrl);
  }
  return undefined;
});

export const config = {
  matcher: [
    '/((?!sign-in|api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
