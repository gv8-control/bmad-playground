/**
 * @jest-environment node
 *
 * Story 4.7: Confirm HTTP/2-Capable Reverse Proxy in Front of apps/agent-be
 *
 * Verifies:
 * - AC-1: HTTP/2 ALPN negotiation confirmed and recorded — the evidence file
 *         docs/runbooks/http2-verification.md exists and contains the required
 *         verification artifacts (agent-be URL, curl command, ALPN line,
 *         HTTP/2 status line, date, tool version, proxy-needed note, NFR-R4
 *         reference).
 * - AC-2: Scope boundary — the evidence file notes that end-to-end 10-concurrent-
 *         SSE verification is Story 3.11's scope, not this story.
 *
 * This is a verification-evidence regression guard, not a live network test.
 * It validates the committed evidence file's structure so that a future change
 * (e.g. deleting or emptying the file) is caught by CI. The live HTTP/2 check
 * itself is a one-time manual verification (per DP-5: no CI regression guard
 * for HTTP/2 — it is a deployment invariant, not a code regression).
 *
 * Run: yarn nx test agent-be -- --testPathPattern=http2-verification
 */

import * as fs from 'fs';
import * as path from 'path';

const EVIDENCE_PATH = path.resolve(
  __dirname,
  '../../../../docs/runbooks/http2-verification.md',
);

function loadEvidence(): string {
  return fs.readFileSync(EVIDENCE_PATH, 'utf8');
}

function loadEvidenceLines(): string[] {
  return loadEvidence().split('\n');
}

describe('Story 4.7 — HTTP/2 Verification Evidence File', () => {
  describe('AC-1: HTTP/2 ALPN negotiation confirmed and recorded', () => {
    test('[P0] evidence file exists at docs/runbooks/http2-verification.md', () => {
      expect(fs.existsSync(EVIDENCE_PATH)).toBe(true);
    });

    test('[P0] evidence file contains the agent-be public URL', () => {
      const content = loadEvidence();
      expect(content).toMatch(/https:\/\/[a-z0-9-]*agent-be[a-z0-9-]*\.up\.railway\.app/i);
    });

    test('[P0] evidence file contains the curl command that was run', () => {
      const content = loadEvidence();
      expect(content).toMatch(/curl.*--http2/);
    });

    test('[P0] evidence file contains the ALPN negotiation line', () => {
      const content = loadEvidence();
      expect(content).toMatch(/ALPN.*h2/i);
    });

    test('[P0] evidence file contains the HTTP/2 status line', () => {
      const content = loadEvidence();
      expect(content).toMatch(/HTTP\/2\s*200/i);
    });

    test('[P0] evidence file contains the date of verification', () => {
      const content = loadEvidence();
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}/);
    });

    test('[P0] evidence file contains the tool and version used', () => {
      const content = loadEvidence();
      expect(content).toMatch(/curl\s+\d/i);
    });

    test('[P0] evidence file notes whether a reverse proxy/sidecar was needed', () => {
      const content = loadEvidence();
      expect(content).toMatch(/(reverse\s+proxy|sidecar).*?needed.*?\bno\b|\bno\b.*?(reverse\s+proxy|sidecar).*?needed/i);
    });

    test('[P0] evidence file references NFR-R4 (10 concurrent SSE connections)', () => {
      const content = loadEvidence();
      expect(content).toMatch(/NFR-R4/i);
      expect(content).toMatch(/10\s+concurrent/i);
    });

    test('[P0] evidence file references the /health endpoint (not /api/health)', () => {
      const content = loadEvidence();
      expect(content).toMatch(/\/health\b/);
      expect(content).not.toMatch(/\/api\/health/);
    });
  });

  describe('AC-2: Scope boundary — no end-to-end SSE test', () => {
    test('[P0] evidence file notes that 10-concurrent-SSE verification is Story 3.11 scope', () => {
      const content = loadEvidence();
      expect(content).toMatch(/3\.11|3-11/i);
      expect(content).toMatch(/SSE|streaming/i);
    });

    test('[P0] evidence file clarifies this story confirms transport capability only', () => {
      const content = loadEvidence();
      expect(content).toMatch(/transport/i);
    });
  });

  describe('Evidence file structure', () => {
    test('[P0] evidence file has a markdown heading', () => {
      const lines = loadEvidenceLines();
      const hasHeading = lines.some((l) => /^#\s+/.test(l));
      expect(hasHeading).toBe(true);
    });

    test('[P0] evidence file is non-trivial (at least 10 lines)', () => {
      const lines = loadEvidenceLines().filter((l) => l.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(10);
    });
  });
});
