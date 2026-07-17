export const BMAD_DOCUMENTATION_LINK = 'https://docs.bmad-method.org';

export type ValidationErrorCode =
  | 'MISSING_DIRECTORY'
  | 'NO_SKILLS_FOUND'
  | 'UNSUPPORTED_VERSION';

/** Distinct GitHub rate-limit signal (primary or secondary), never a credential failure. */
export const RATE_LIMITED_MESSAGE = 'GitHub rate limit reached. Try again in a few minutes.';

export interface ValidationResult {
  valid: true;
  repositoryUrl: string;
  bmadVersion: string;
  checkedAt: string;
}

export interface ValidationError {
  code: ValidationErrorCode;
  message: string;
  meta: {
    missing?: string[];
    detectedVersion?: string;
    documentationLink: string;
  };
}

export type ValidateRepositoryResult = ValidationResult | ValidationError;
