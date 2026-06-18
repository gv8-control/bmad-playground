export type CredentialHealthStatus = 'valid' | 'expired' | 'revoked' | 'unknown';

export interface CredentialHealthEvent {
  status: CredentialHealthStatus;
  checkedAt: Date;
}
