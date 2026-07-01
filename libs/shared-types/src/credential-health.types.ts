export type CredentialHealthStatus = 'healthy' | 'failed';

export interface CredentialHealthEvent {
  status: CredentialHealthStatus;
  checkedAt: Date;
}
