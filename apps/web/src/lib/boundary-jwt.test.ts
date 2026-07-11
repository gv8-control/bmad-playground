/**
 * @jest-environment node
 */
import { jwtVerify, decodeJwt } from 'jose';
import { mintBoundaryJwt } from './boundary-jwt';

describe('boundary-jwt', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, AUTH_SECRET: 'test-secret-for-jwt-1234567890' };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('[P0] mintBoundaryJwt', () => {
    it('mints a JWT with the correct payload (userId, iat)', async () => {
      const token = await mintBoundaryJwt('user-123');
      const payload = decodeJwt(token);
      expect(payload.userId).toBe('user-123');
      expect(payload.iat).toBeDefined();
    });

    it('token is verifiable with AUTH_SECRET via jose.jwtVerify()', async () => {
      const token = await mintBoundaryJwt('user-456');
      const { payload } = await jwtVerify(
        token,
        new TextEncoder().encode(process.env.AUTH_SECRET),
      );
      expect(payload.userId).toBe('user-456');
    });

    it('token has an expiry', async () => {
      const token = await mintBoundaryJwt('user-789');
      const payload = decodeJwt(token);
      expect(payload.exp).toBeDefined();
      expect(payload.exp).toBeGreaterThan(payload.iat ?? 0);
    });
  });
});
