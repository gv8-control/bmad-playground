export const BMAD_DOCUMENTATION_LINK = 'https://docs.bmad-method.org';

export type ValidationErrorCode =
  | 'MISSING_DIRECTORY'
  | 'NO_SKILLS_FOUND'
  | 'UNSUPPORTED_VERSION';

export interface ValidationResult {
  valid: true;
  repositoryUrl: string;
  bmadVersion: string;
  skillsCount: number;
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
