import GitHub from 'next-auth/providers/github';
import type { NextAuthConfig } from 'next-auth';

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
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
