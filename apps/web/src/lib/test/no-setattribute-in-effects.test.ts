/**
 * @jest-environment node
 *
 * HYD-UNIT-003: setAttribute-in-useEffect regression guard.
 *
 * Scans all .tsx files under apps/web/src/ for setAttribute calls inside
 * useEffect callbacks in client components. Fails if any 'use client' file
 * contains setAttribute( inside a useEffect block.
 *
 * This guards against the defect class where imperative DOM manipulation
 * via setAttribute in a client component's useEffect causes hydration
 * mismatches (the server HTML lacks the attribute, the effect adds it
 * after hydration, and React detects the divergence).
 *
 * Currently zero matches expected — the fix removed the last setAttribute
 * from AppShell.tsx and replaced it with declarative tabIndex props.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '../..');

function findTsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsxFiles(fullPath, acc);
    } else if (entry.name.endsWith('.tsx')) {
      acc.push(fullPath);
    }
  }
  return acc;
}

/**
 * Finds the matching closing brace for the opening brace at openPos.
 * Simple brace counter — does not parse strings/comments. Sufficient for
 * a regression guard (not a full AST parser).
 */
function findMatchingBrace(content: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function checkFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Only check client components
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("'use client'") && !trimmed.startsWith('"use client"')) {
    return [];
  }

  const violations: string[] = [];
  const useEffectRegex = /useEffect\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = useEffectRegex.exec(content)) !== null) {
    // Find the opening brace of the useEffect callback body
    let pos = match.index + match[0].length;
    while (pos < content.length && content[pos] !== '{') {
      pos++;
    }
    if (pos >= content.length) continue;

    const endPos = findMatchingBrace(content, pos);
    if (endPos === -1) continue;

    const callbackBody = content.slice(pos, endPos + 1);
    if (callbackBody.includes('setAttribute(')) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      violations.push(`${filePath}:${lineNum}`);
    }
  }

  return violations;
}

describe('HYD-UNIT-003: no setAttribute in useEffect (regression guard)', () => {
  it('[P1] no client component uses setAttribute inside useEffect', () => {
    const files = findTsxFiles(SRC_DIR);
    const violations: string[] = [];

    for (const file of files) {
      violations.push(...checkFile(file));
    }

    expect(violations).toEqual([]);
  });
});
