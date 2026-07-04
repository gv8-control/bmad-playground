/**
 * @jest-environment node
 *
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Unit tests for generateSemanticTitle() pure function.
 *
 * Covers: AC-3 (semantic title derivation from first message content).
 */
import { generateSemanticTitle } from './semantic-title';

describe('[P0] generateSemanticTitle', () => {
  it('extracts first 5 words from content', () => {
    expect(generateSemanticTitle('hello world foo bar baz')).toBe(
      'hello world foo bar baz',
    );
  });

  it('limits to 5 words even when content has more', () => {
    expect(generateSemanticTitle('one two three four five six seven')).toBe(
      'one two three four five',
    );
  });

  it('strips leading / from slash commands', () => {
    const result = generateSemanticTitle('/bmad-prd create a product brief');
    expect(result).toBe('bmad-prd create a product brief');
    expect(result.startsWith('/')).toBe(false);
  });

  it('truncates long content with ellipsis at 60 chars', () => {
    const longContent =
      'abcdefghijklmnoabcdefghijklmno abcdefghijklmnoabcdefghijklmno abcdefghijklmnoabcdefghijklmno abcdefghijklmnoabcdefghijklmno abcdefghijklmnoabcdefghijklmno';
    const result = generateSemanticTitle(longContent);
    expect(result.length).toBe(60);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  it('[P1] returns "New Conversation" for empty content', () => {
    expect(generateSemanticTitle('')).toBe('New Conversation');
  });

  it('[P1] returns "New Conversation" for whitespace-only content', () => {
    expect(generateSemanticTitle('   ')).toBe('New Conversation');
  });
});
