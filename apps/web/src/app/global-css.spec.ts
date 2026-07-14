/**
 * @jest-environment node
 *
 * ATDD — Story 5.4: Fix Token-Usage Drift and Token-Config Gaps
 * Structural test for global.css scrollbar hiding rules.
 * Covers AC-7 (scrollbar hiding on scrollable panels).
 *
 * GREEN PHASE: tests are active after Story 5.4 implementation.
 * Priority tags: P0 for AC coverage.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const cssContent = readFileSync(
  join(__dirname, 'global.css'),
  'utf-8',
);

describe('global.css — scrollbar hiding (Story 5.4, AC-7)', () => {
  it('[P0] defines .no-scrollbar with scrollbar-width: none (Firefox) (AC-7)', () => {
    expect(cssContent).toContain('.no-scrollbar');
    expect(cssContent).toContain('scrollbar-width: none');
  });

  it('[P0] defines .no-scrollbar::-webkit-scrollbar with display: none (Chrome/Safari) (AC-7)', () => {
    expect(cssContent).toContain('.no-scrollbar::-webkit-scrollbar');
    expect(cssContent).toContain('display: none');
  });
});
