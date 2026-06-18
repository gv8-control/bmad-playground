import { type AuthProvider, loadStorageState, getStorageStatePath } from '@seontechnologies/playwright-utils/auth-session';
import type { AuthOptions } from '@seontechnologies/playwright-utils/auth-session';
import * as OTPAuth from 'otpauth';

// Suppress unused import warning — kept for future use in manageAuthToken overrides.
void OTPAuth;

type CookieEntry = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
};

const cookiesFrom = (tokenData: Record<string, unknown>): CookieEntry[] => {
  const raw = tokenData['cookies'];
  return Array.isArray(raw) ? (raw as CookieEntry[]) : [];
};

const githubAuthProvider: AuthProvider = {
  getEnvironment: (options?: Partial<AuthOptions>) => options?.environment ?? process.env.TEST_ENV ?? 'local',

  getUserIdentifier: (options?: Partial<AuthOptions>) => options?.userIdentifier ?? 'default',

  extractToken: (tokenData) => {
    const cookie = cookiesFrom(tokenData).find((c) => c.name === 'authjs.session-token');
    return cookie?.value ?? null;
  },

  extractCookies: (tokenData) => cookiesFrom(tokenData),

  isTokenExpired: (rawToken) => {
    // Auth.js session tokens are opaque — expiry cannot be determined from the string alone.
    // The token is considered valid until the server rejects it.
    void rawToken;
    return false;
  },

  manageAuthToken: async (_request, options) => {
    // Auth.js v5 GitHub OAuth requires a real browser (auth.setup.ts handles that).
    // Here we load the storage state that auth.setup.ts already saved to disk.
    const storagePath = getStorageStatePath(options ?? {});
    const state = loadStorageState(storagePath);
    if (!state) throw new Error(`No auth storage state found at ${storagePath}. Run auth.setup.ts first.`);
    return state;
  },

  clearToken: (_options) => {
    // Token is cleared by deleting the storage state file — handled by Playwright's built-in
    // storage state management. No additional action needed here.
  },
};

export default githubAuthProvider;
