import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';

export default NextAuth(authConfig).auth;

export const config = {
  matcher: [
    '/((?!sign-in(?:/|$)|api/auth|api/internal/test|_next/static|_next/image|favicon\\.ico).*)',
  ],
};
