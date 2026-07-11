import { SignJWT } from 'jose';

export async function mintBoundaryJwt(userId: string): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET is not configured');
  }
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('bmad-easy:boundary')
    .setAudience('bmad-easy:agent-be')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(new TextEncoder().encode(secret));
}
