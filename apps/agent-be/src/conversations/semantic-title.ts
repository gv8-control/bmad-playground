const MAX_TITLE_LENGTH = 60;
const MAX_WORDS = 5;
const FALLBACK_TITLE = 'New Conversation';

export function generateSemanticTitle(content: string): string {
  const stripped = content.replace(/^\//, '').trim();
  if (!stripped) {
    return FALLBACK_TITLE;
  }
  const words = stripped.split(/\s+/).slice(0, MAX_WORDS).join(' ');
  if (words.length > MAX_TITLE_LENGTH) {
    return Array.from(words).slice(0, MAX_TITLE_LENGTH - 1).join('') + '\u2026';
  }
  return words;
}
