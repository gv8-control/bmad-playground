# Story 1.4: Validate BMAD Initialization in the Connected Repository

Status: ready-for-dev

## Story

As a user connecting a repository,
I want the platform to confirm BMAD is properly set up before I can start working,
so that I don't hit confusing failures later in a Conversation.

## Acceptance Criteria

### Repository Structure Validation
1. **Given** a repository that has passed the write-access check in Story 1.3
   **When** the platform inspects it
   **Then** it confirms `_bmad/`, `_bmad-output/`, and `.claude/` directories are present
   **And** the BMAD version is 6.x

2. **Given** an empty `_bmad-output/` directory
   **When** validation runs
   **Then** it is accepted as valid (not treated as an error)

### Error Handling - Missing Directories
3. **Given** any of `_bmad/`, `_bmad-output/`, `.claude/` is missing
   **When** validation runs
   **Then** a blocking message names the specific missing prerequisite
   **And** includes a link to BMAD documentation

### Error Handling - Missing Skills
4. **Given** `.claude/skills/` is absent
   **When** validation runs
   **Then** a blocking message states that no Skills directory was found

5. **Given** `.claude/skills/` exists but contains no Skill files
   **When** validation runs
   **Then** a blocking message states that no Skills were found

### Error Handling - Version Mismatch
6. **Given** the detected BMAD version is outside the v6.x range
   **When** validation runs
   **Then** a blocking message states only BMAD v6 is supported
   **And** names the detected version

## Tasks / Subtasks

- [ ] Implement repository inspection service to check for required BMAD directories
  - [ ] Check for `_bmad/` directory existence
  - [ ] Check for `_bmad-output/` directory existence
  - [ ] Check for `.claude/` directory existence
  - [ ] Accept empty `_bmad-output/` as valid

- [ ] Implement BMAD version detection
  - [ ] Read BMAD version from appropriate configuration files
  - [ ] Validate version is within 6.x range
  - [ ] Extract and report detected version on failure

- [ ] Implement Skills directory validation
  - [ ] Check for `.claude/skills/` directory existence
  - [ ] Scan for Skill files (.md files in skills directory)
  - [ ] Report specific error for missing directory vs empty directory

- [ ] Create blocking error messages with documentation links
  - [ ] Generate specific error messages for each missing prerequisite
  - [ ] Include BMAD documentation links in error responses
  - [ ] Format errors consistently for UI display

- [ ] Integrate validation into repository connection flow
  - [ ] Trigger validation after Story 1.3 write-access check passes
  - [ ] Block progression if validation fails
  - [ ] Redirect to Project Map on successful validation

- [ ] Add unit tests for validation logic
  - [ ] Test all success paths
  - [ ] Test all error paths (missing dirs, missing skills, version mismatch)
  - [ ] Test edge cases (empty directories, malformed version files)

## Dev Notes

### Architecture Context
- This story builds on Story 1.3 (Connect a Repository by URL) which handles OAuth token validation and storage
- Validation happens server-side in `apps/agent-be` during the repository connection flow
- The validation service must have access to the GitHub OAuth token to inspect the repository contents
- BMAD version detection should read from `_bmad/package.json` or similar version indicator files
- Skills detection should scan `.claude/skills/` for `.md` files that follow BMAD skill naming conventions

### Technical Requirements
- **Service Location**: Validation logic belongs in `apps/agent-be/src/services/repository-validation.service.ts`
- **API Endpoint**: POST `/api/repositories/validate` in `apps/agent-be`
- **Request**: Repository URL and authenticated user context
- **Response**: Validation result with success/failure details
- **GitHub API**: Use `@octokit/rest` to list repository contents (already available from Story 1.3)
- **Version Detection**: Parse version from `_bmad/package.json` or `_bmad/version` file
- **Skills Detection**: List files in `.claude/skills/` and filter for `.md` files

### Code Structure Requirements
- Follow existing patterns from Story 1.3 for GitHub API interactions
- Use shared types from `libs/shared-types` for request/response contracts
- Implement as a NestJS service with dependency injection
- Add comprehensive logging for debugging validation failures

### Error Handling Patterns
- Use consistent error envelope: `{ code: string, message: string, meta: { missing?: string[], detectedVersion?: string, documentationLink: string } }`
- Documentation links should point to official BMAD documentation
- Error codes should be specific: `MISSING_DIRECTORY`, `NO_SKILLS_FOUND`, `UNSUPPORTED_VERSION`

### Security Considerations
- Validation must use the user's OAuth token (from Story 1.3) - never platform credentials
- Token must be passed through securely - never logged or exposed in error responses
- Repository contents are read-only during validation - no write operations

### Performance Requirements
- Validation should complete within 2-3 seconds for typical repositories
- Parallelize directory existence checks where possible
- Cache validation results for the same repository URL to avoid redundant checks

### Testing Requirements
- Mock GitHub API responses for unit tests
- Test all combinations of missing directories
- Test version parsing with various format possibilities
- Test skills detection with different directory structures

### Project Structure Notes
- Alignment with unified project structure: Service layer in `apps/agent-be/src/services/`
- Follow existing NestJS patterns from Story 1.2 and 1.3
- Use Prisma client from `libs/database-schemas` for any database operations
- Shared types in `libs/shared-types` for API contracts

### Dependencies
- **Story 1.3**: Must be complete - provides OAuth token handling and repository connection infrastructure
- **Story 1.2**: Provides authentication context and user session management
- **Story 1.1**: Provides the Nx monorepo structure and shared libraries

### Integration Points
- Called from the onboarding flow after Story 1.3 succeeds
- On success: Proceeds to Story 1.5 (Resolve Git Identity) or directly to Project Map (Epic 2)
- On failure: Returns to onboarding screen with specific error message and retry option

## Dev Agent Guardrails

### CRITICAL: Do Not Reinvent
- **DO NOT** create new GitHub API client - reuse the Octokit client from Story 1.3
- **DO NOT** create new authentication flow - use existing auth from Story 1.2
- **DO NOT** create new error handling patterns - follow existing patterns from Story 1.3
- **DO NOT** create new database models - use existing User/Repository models

### CRITICAL: File Locations
- **Service**: `apps/agent-be/src/services/repository-validation.service.ts`
- **Controller**: `apps/agent-be/src/controllers/repository-validation.controller.ts`
- **DTOs**: `apps/agent-be/src/dto/repository-validation.dto.ts`
- **Tests**: `apps/agent-be/src/services/repository-validation.service.spec.ts`
- **API Route**: `apps/agent-be/src/routes/repository-validation.route.ts`

### CRITICAL: Technical Stack
- **Framework**: NestJS (same as Story 1.2, 1.3)
- **GitHub Client**: `@octokit/rest` (already dependency from Story 1.3)
- **Validation**: Use `zod` for request/response validation (check if already in project)
- **Logging**: Use existing logger from Story 1.3 patterns

### CRITICAL: Code Patterns
- Follow the service-controller pattern established in Story 1.3
- Use dependency injection for all services
- Implement proper error handling with try/catch in service layer
- Use async/await consistently for all GitHub API calls

### CRITICAL: Testing Patterns
- Mock all external dependencies (GitHub API, database)
- Test both happy path and all error scenarios
- Follow Jest patterns from Story 1.3 tests

## Architecture Compliance

### Monorepo Structure
```
bmad-easy/
├── apps/
│   └── agent-be/
│       ├── src/
│       │   ├── services/
│       │   │   └── repository-validation.service.ts (NEW)
│       │   ├── controllers/
│       │   │   └── repository-validation.controller.ts (NEW)
│       │   ├── dto/
│       │   │   └── repository-validation.dto.ts (NEW)
│       │   └── routes/
│       │       └── repository-validation.route.ts (NEW)
│       └── test/
│           └── repository-validation.service.spec.ts (NEW)
└── libs/
    ├── shared-types/
    │   └── (update with new DTO interfaces)
    └── database-schemas/
        └── (no changes needed)
```

### API Contract
**Request (POST /api/repositories/validate):**
```typescript
{
  repositoryUrl: string;
  userId: string;
}
```

**Success Response (200):**
```typescript
{
  valid: true;
  repositoryUrl: string;
  bmadVersion: string;
  skillsCount: number;
  checkedAt: string; // ISO8601
}
```

**Error Response (400):**
```typescript
{
  code: 'MISSING_DIRECTORY' | 'NO_SKILLS_FOUND' | 'UNSUPPORTED_VERSION';
  message: string;
  meta: {
    missing?: string[];
    detectedVersion?: string;
    documentationLink: string;
  };
}
```

### Data Flow
1. Frontend (`apps/web`) calls `/api/repositories/validate` with repository URL
2. Backend (`apps/agent-be`) validates request and authenticates user
3. Service retrieves user's OAuth token from database (Story 1.3 storage)
4. Service uses Octokit to list repository contents
5. Service checks for required directories and validates version
6. Service returns validation result
7. Frontend handles success (proceed) or error (display blocking message)

## Library/Framework Requirements

### Required Libraries (Already Available)
- `@nestjs/common`: ^10.x (from Story 1.1 scaffold)
- `@nestjs/core`: ^10.x
- `@octokit/rest`: ^20.x (from Story 1.3)
- `zod`: ^3.x (check if available, add if not)

### Type Definitions (Add to shared-types)
```typescript
// In libs/shared-types/src/repository-validation.ts
export interface ValidateRepositoryRequest {
  repositoryUrl: string;
  userId: string;
}

export interface ValidationResult {
  valid: boolean;
  repositoryUrl: string;
  bmadVersion?: string;
  skillsCount?: number;
  checkedAt: string;
}

export interface ValidationError {
  code: 'MISSING_DIRECTORY' | 'NO_SKILLS_FOUND' | 'UNSUPPORTED_VERSION';
  message: string;
  meta: {
    missing?: string[];
    detectedVersion?: string;
    documentationLink: string;
  };
}
```

## File Structure Requirements

### New Files to Create
1. `apps/agent-be/src/services/repository-validation.service.ts` - Core validation logic
2. `apps/agent-be/src/controllers/repository-validation.controller.ts` - HTTP endpoint
3. `apps/agent-be/src/dto/repository-validation.dto.ts` - Request/response DTOs
4. `apps/agent-be/src/routes/repository-validation.route.ts` - Route configuration
5. `apps/agent-be/src/services/repository-validation.service.spec.ts` - Unit tests
6. `libs/shared-types/src/repository-validation.ts` - Shared type definitions

### Files to Update
1. `apps/agent-be/src/app.module.ts` - Register new service and controller
2. `apps/agent-be/src/main.ts` - No changes needed
3. `apps/web` - Add API call to validation endpoint in onboarding flow

## Testing Requirements

### Unit Tests (100% Coverage Target)
- [ ] Test successful validation with all directories present and valid version
- [ ] Test successful validation with empty `_bmad-output/`
- [ ] Test missing `_bmad/` directory
- [ ] Test missing `_bmad-output/` directory
- [ ] Test missing `.claude/` directory
- [ ] Test multiple missing directories
- [ ] Test missing `.claude/skills/` directory
- [ ] Test empty `.claude/skills/` directory (no .md files)
- [ ] Test version detection for v6.0.0, v6.1.0, v6.9.9
- [ ] Test version detection for v5.x.x (unsupported)
- [ ] Test version detection for v7.0.0 (unsupported)
- [ ] Test GitHub API errors (404, 403, 500)
- [ ] Test malformed version file parsing

### Integration Tests
- [ ] Test full onboarding flow: Story 1.3 → Story 1.4 → Story 1.5
- [ ] Test error display in frontend
- [ ] Test retry after fixing repository issues

## Previous Story Intelligence

**From Story 1.3 (Connect a Repository by URL):**
- GitHub OAuth token is stored encrypted (AES-256-GCM) in database
- Token is associated with user and repository
- Octokit client is configured and available for use
- Repository write access validation is already implemented
- Error handling patterns for GitHub API are established
- Service layer pattern: `repository-connection.service.ts`
- Controller pattern: `repository-connection.controller.ts`

**Key Learnings to Apply:**
- Reuse the Octokit client configuration from Story 1.3
- Follow the same token retrieval pattern from database
- Use the same error handling and logging approach
- Follow the same DTO validation patterns
- Use the same testing mock patterns for GitHub API

## References

- **Epics Source**: `_bmad-output/planning-artifacts/epics.md` lines 307-330
- **Architecture**: `_bmad-output/planning-artifacts/architecture.md` - OAuth token storage (NFR-S4), GitHub API patterns
- **UX Design**: `_bmad-output/planning-artifacts/ux-designs/ux-bmad-easy-2026-06-15/DESIGN.md` - Error message styling
- **Story 1.3**: `_bmad-output/implementation-artifacts/1-3-connect-a-repository-by-url.md` - Token handling patterns
- **Story 1.2**: `_bmad-output/implementation-artifacts/1-2-sign-in-with-github.md` - Authentication patterns
- **Story 1.1**: `_bmad-output/implementation-artifacts/1-1-scaffold-the-platform-monorepo-and-ci-pipeline.md` - Project structure

## Dev Agent Record

### Agent Model Used
Claude Sonnet 4.6 (as per architecture requirements)

### Debug Log References
- GitHub API calls: Use debug namespace `github:api`
- Validation logic: Use debug namespace `repository:validation`
- Error handling: Use debug namespace `repository:validation:error`

### Completion Notes List
- Validation must be blocking - user cannot proceed without passing
- Error messages must be user-friendly and actionable
- Documentation links must point to official BMAD docs
- Version check must be semver-aware (6.x means >=6.0.0 <7.0.0)

### File List
**New Files:**
- `apps/agent-be/src/services/repository-validation.service.ts`
- `apps/agent-be/src/controllers/repository-validation.controller.ts`
- `apps/agent-be/src/dto/repository-validation.dto.ts`
- `apps/agent-be/src/routes/repository-validation.route.ts`
- `apps/agent-be/src/services/repository-validation.service.spec.ts`
- `libs/shared-types/src/repository-validation.ts`

**Updated Files:**
- `apps/agent-be/src/app.module.ts`
- `apps/web/[onboarding page]` - Add validation call and error handling
