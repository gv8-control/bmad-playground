/**
 * @jest-environment node
 *
 * Story 5.3: Fix Conversation Stream Structural Drift
 * Server Component unit tests for NewConversationPage.
 *
 * AC-6: New-conversation page header removal
 * - No visible Breadcrumb or h1 header renders
 * - A visually-hidden <h1 tabIndex={-1}> exists for AppShell route-focus
 */

const mockAuth = jest.fn();
jest.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

const mockMintBoundaryJwt = jest.fn();
jest.mock('@/lib/boundary-jwt', () => ({
  mintBoundaryJwt: (...args: unknown[]) => mockMintBoundaryJwt(...args),
}));

jest.mock('@/components/shell/Breadcrumb', () => ({
  Breadcrumb: () => 'Breadcrumb',
}));

jest.mock('@/components/conversation/ConversationPane', () => ({
  ConversationPane: ({
    boundaryJwt,
    apiUrl,
    placeholder,
  }: {
    boundaryJwt: string;
    apiUrl: string;
    placeholder?: string;
  }) => `ConversationPane:${boundaryJwt}:${apiUrl}:${placeholder ?? ''}`,
}));

import { renderToStaticMarkup } from 'react-dom/server';
import NewConversationPage from './page';

describe('NewConversationPage — Story 5.3 structural drift', () => {
  const originalApiUrl = process.env.API_URL;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user-1' });
    mockMintBoundaryJwt.mockResolvedValue('jwt-token');
    process.env.API_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.API_URL = originalApiUrl;
  });

  describe('[P0] AC-6 — Visible header removal', () => {
    it('does not render a visible Breadcrumb', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain('Breadcrumb');
    });

    it('does not render a visible <header> element', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      expect(html).not.toContain('<header');
    });

    it('does not render a visible h1 with "New Conversation" text', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      const h1Tags = html.match(/<h1[^>]*>[^<]*<\/h1>/g) ?? [];
      for (const h1 of h1Tags) {
        if (h1.includes('New Conversation')) {
          expect(h1).toContain('sr-only');
        }
      }
    });
  });

  describe('[P0] AC-6 — Visually-hidden h1 for route-focus', () => {
    it('renders a visually-hidden h1 with tabIndex={-1}', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      expect(html).toMatch(/<h1[^>]*tabindex="-1"[^>]*>/);
    });

    it('visually-hidden h1 has sr-only class', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      expect(html).toMatch(/<h1[^>]*sr-only[^>]*>/);
    });

    it('visually-hidden h1 contains "New Conversation" text', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      expect(html).toMatch(/<h1[^>]*>New Conversation<\/h1>/);
    });
  });

  describe('[P0] AC-5 — Branded placeholder', () => {
    it('passes placeholder="Message bmad-easy…" to ConversationPane', async () => {
      const element = await NewConversationPage();
      const html = renderToStaticMarkup(element);
      expect(html).toContain('ConversationPane:jwt-token:http://localhost:3001:Message bmad-easy…');
    });
  });
});
