import GitHub from 'next-auth/providers/github';
import type { NextAuthConfig } from 'next-auth';
import { NextResponse } from 'next/server';

export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  pages: {
    signIn: '/sign-in',
    error: '/sign-in',
  },
  callbacks: {
    authorized({ auth, request }) {
      if (auth?.user) return true;

      const { pathname } = request.nextUrl;
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const signInUrl = new URL('/sign-in', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return Response.redirect(signInUrl);
    },
  },
};
