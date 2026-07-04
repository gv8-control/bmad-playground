export type ArtifactId = string;

export type ArtifactType =
  | 'brainstorming'
  | 'prd'
  | 'architecture'
  | 'epics'
  | 'ux'
  | 'technical-research'
  | 'market-research'
  | 'domain-research'
  | 'product-brief'
  | 'prfaq'
  | 'test-arch'
  | 'other';

export type ArtifactStatus = 'completed' | 'in-progress';

export type SyncErrorCode =
  | 'NO_CREDENTIAL'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'NO_REPO_CONNECTION'
  | 'UNKNOWN';

export type SyncArtifactsResult =
  | { success: true; artifactsUpserted: number; artifactsDeleted: number }
  | { error: string; errorCode: SyncErrorCode };
