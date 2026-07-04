/**
 * @jest-environment node
 *
 * Story 3.4: See Tool Calls and Recognized Actions Inline
 * Unit tests for ToolPillClassifierService.
 *
 * Covers: AC-2 (git commit → Semantic Pill promotion logic),
 *         AC-3 (failed commit returns null → error-state Tool Pill).
 *
 * TDD RED PHASE — tests are skipped until implementation lands.
 * Remove it.skip() → it() when activating for the current task.
 */
import { ToolPillClassifierService } from './tool-pill-classifier.service';

describe('ToolPillClassifierService', () => {
  let service: ToolPillClassifierService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      repoConnection: {
        findUnique: jest.fn().mockResolvedValue({ id: 'repo-1' }),
      },
      artifact: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    service = new ToolPillClassifierService(mockPrisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('[P0] AC-2 — Non-commit tool calls return null', () => {
    it.skip('returns null for non-Bash tool', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Read',
        'read file.txt',
        'file content',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it.skip('returns null for Bash without git commit in input', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git status',
        'nothing to commit, working tree clean',
        'user-1',
      );
      expect(result).toBeNull();
    });
  });

  describe('[P0] AC-3 — Failed commit returns null', () => {
    it.skip('returns null for failed commit (error in output)', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "test"',
        'error: failed to push some refs',
        'user-1',
      );
      expect(result).toBeNull();
    });

    it.skip('returns null for commit with non-zero exit', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "test"',
        'Command exited with code 1',
        'user-1',
      );
      expect(result).toBeNull();
    });
  });

  describe('[P0] AC-2 — Successful commit touching _bmad-output/', () => {
    const successOutput = `[main abc1234] Update PRD
 1 file changed, 10 insertions(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`;

    it.skip('returns promoted event for successful commit touching _bmad-output/', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update PRD"',
        successOutput,
        'user-1',
      );
      expect(result).not.toBeNull();
      expect(result?.type).toBe('TOOL_CALL_PROMOTED');
      expect(result?.toolCallId).toBe('tc-1');
    });

    it.skip('derives correct lowercase artifactType from path', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update PRD"',
        successOutput,
        'user-1',
      );
      expect(result?.artifactType).toBe('prd');
    });

    it.skip('uses Postgres title and type when artifact is found', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: 'art-1',
        title: 'Authoritative Title',
        type: 'architecture',
      });

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result?.artifactType).toBe('architecture');
      expect(result?.artifactTitle).toBe('Authoritative Title');
    });

    it.skip('returns viewHref with id when artifact in Postgres', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue({
        id: 'art-42',
        title: 'My PRD',
        type: 'prd',
      });

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result?.viewHref).toBe('/artifacts?id=art-42');
    });

    it.skip('returns viewHref without id when artifact not in Postgres', async () => {
      mockPrisma.artifact.findFirst.mockResolvedValue(null);

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(result?.viewHref).toBe('/artifacts');
    });
  });

  describe('[P1] AC-2 — Edge cases', () => {
    it.skip('returns null for commit not touching _bmad-output/ files', async () => {
      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update README"',
        `[main abc1234] Update README
 1 file changed, 1 insertion(+)
 create mode 100644 README.md`,
        'user-1',
      );
      expect(result).toBeNull();
    });

    it.skip('logs warn on Postgres lookup failure and returns degraded viewHref', async () => {
      mockPrisma.artifact.findFirst.mockRejectedValue(new Error('DB connection lost'));
      const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

      const result = await service.classifyToolResult(
        'tc-1',
        'Bash',
        'git commit -m "Update"',
        `[main abc1234] Update
 1 file changed, 1 insertion(+)
 create mode 100644 _bmad-output/planning-artifacts/prds/prd-1.md`,
        'user-1',
      );
      expect(warnSpy).toHaveBeenCalled();
      expect(result?.viewHref).toBe('/artifacts');
    });
  });
});
