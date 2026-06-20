import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { getPrisma } from './prisma';
import { encryptToken } from './crypto';

declare module 'next-auth' {
  interface Session {
    userId?: string;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === 'github' && profile) {
        const githubProfile = profile as unknown as {
          id: number;
          login: string;
          name?: string | null;
          email?: string | null;
        };
        const user = await getPrisma().user.upsert({
          where: { githubId: String(githubProfile.id) },
          update: {
            name: githubProfile.name ?? null,
            email: githubProfile.email ?? null,
            githubLogin: githubProfile.login,
          },
          create: {
            githubId: String(githubProfile.id),
            githubLogin: githubProfile.login,
            name: githubProfile.name ?? null,
            email: githubProfile.email ?? null,
          },
        });
        token.userId = user.id;

        if (account.access_token) {
          const encrypted = encryptToken(account.access_token);
          await getPrisma().oAuthCredential.upsert({
            where: { userId: user.id },
            update: {
              encryptedDek: encrypted.encryptedDek,
              dekNonce: encrypted.dekNonce,
              encryptedToken: encrypted.encryptedToken,
              tokenNonce: encrypted.tokenNonce,
            },
            create: {
              userId: user.id,
              encryptedDek: encrypted.encryptedDek,
              dekNonce: encrypted.dekNonce,
              encryptedToken: encrypted.encryptedToken,
              tokenNonce: encrypted.tokenNonce,
            },
          });
        } else {
          console.error('[auth] GitHub sign-in completed but access_token is missing — OAuth credential not stored for user', user.id);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.userId = token.userId;
      }
      return session;
    },
  },
});
