/**
 * ATDD — Story 2.5: View a Single Artifact's Rendered Content
 * Story 5.4: Fix Token-Usage Drift (AC-6: h2/hr border-surface-raised)
 * Component unit tests for ArtifactViewer (Server Component, synchronous).
 * Covers AC-1 (rendered Markdown content, read-only, role="main").
 *
 * GREEN PHASE: implementation complete. ArtifactViewer strips YAML
 * frontmatter and renders Markdown via react-markdown + remark-gfm with
 * component-level className overrides. Story 5.4 fixes hairline border tokens.
 *
 * react-markdown is mocked as a render stub that captures props to isolate
 * the test from the markdown library's internals — frontmatter-stripping,
 * container structure, read-only assertion, and prop passing are tested here.
 *
 * Priority tags: P0 for AC coverage, P1 for edge cases.
 */

import { render, screen } from '@testing-library/react';

const mockMarkdown = jest.fn(
  ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
);

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (...args: unknown[]) => mockMarkdown(...(args as [never])),
}));

const mockRemarkGfm = jest.fn(() => null);

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => mockRemarkGfm(),
}));

import { ArtifactViewer } from './ArtifactViewer';

describe('ArtifactViewer — container structure (AC-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders a container with role="main" and aria-label="Artifact content"', () => {
    render(<ArtifactViewer content="# Hello" />);
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('aria-label', 'Artifact content');
  });

  it('[P0] renders no editing controls (read-only view — AC-1)', () => {
    render(<ArtifactViewer content="# Hello" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('input')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
});

describe('ArtifactViewer — markdown rendering props (AC-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P1] passes remark-gfm plugin via remarkPlugins prop', () => {
    render(<ArtifactViewer content="# Hello" />);
    expect(mockMarkdown).toHaveBeenCalled();
    const callArgs = mockMarkdown.mock.calls[0][0] as {
      remarkPlugins?: unknown[];
    };
    expect(callArgs.remarkPlugins).toEqual([expect.any(Function)]);
  });

  it('[P1] passes component overrides via components prop', () => {
    render(<ArtifactViewer content="# Hello" />);
    const callArgs = mockMarkdown.mock.calls[0][0] as {
      components?: Record<string, unknown>;
    };
    expect(callArgs.components).toBeDefined();
    expect(callArgs.components).toHaveProperty('h1');
    expect(callArgs.components).toHaveProperty('h2');
    expect(callArgs.components).toHaveProperty('p');
    expect(callArgs.components).toHaveProperty('code');
    expect(callArgs.components).toHaveProperty('pre');
    expect(callArgs.components).toHaveProperty('table');
    expect(callArgs.components).toHaveProperty('blockquote');
    expect(callArgs.components).toHaveProperty('a');
    expect(callArgs.components).toHaveProperty('strong');
    expect(callArgs.components).toHaveProperty('em');
    expect(callArgs.components).toHaveProperty('del');
    expect(callArgs.components).toHaveProperty('ol');
    expect(callArgs.components).toHaveProperty('hr');
  });
});

describe('ArtifactViewer — frontmatter stripping (AC-1)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] strips YAML frontmatter before passing content to Markdown', () => {
    const content = '---\ntitle: Test\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Hello');
  });

  it('[P0] renders content without frontmatter as-is', () => {
    const content = '# Hello World';
    render(<ArtifactViewer content={content} />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Hello World');
  });

  it('[P0] renders empty content without error', () => {
    render(<ArtifactViewer content="" />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('');
  });

  it('[P1] handles content with no frontmatter (passes through unchanged)', () => {
    const content = 'Some paragraph text.\n\nAnother paragraph.';
    render(<ArtifactViewer content={content} />);
    expect(screen.getByTestId('markdown').textContent).toBe(content);
  });

  it('[P1] handles content with CRLF line endings in frontmatter', () => {
    const content = '---\r\ntitle: Test\r\n---\r\n# Hello';
    render(<ArtifactViewer content={content} />);
    expect(screen.getByTestId('markdown')).toHaveTextContent('# Hello');
  });
});

// ─── Story 5.1: Visual containers (AC-5) ─────────────────────────────────────
//
// GREEN PHASE: tests are active for Task 5 implementation.
//
// AC-5: Artifact-browser frontmatter metadata badge.
// When an artifact has YAML frontmatter, a metadata badge renders above
// the Markdown content showing title, status, and updated fields as
// label-value pairs in JetBrains Mono. The badge uses a
// bg-surface-raised border border-border rounded-md pill style.

describe('ArtifactViewer — frontmatter metadata badge (Story 5.1, AC-5)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders a frontmatter metadata badge when content has frontmatter (AC-5, Task 5.2, 5.3)', () => {
    const content = '---\ntitle: My Artifact\nstatus: draft\nupdated: 2026-07-12\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('.bg-surface-raised.border.border-border.rounded-md');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('aria-label', 'Artifact metadata');
  });

  it('[P0] renders metadata fields as label-value pairs in JetBrains Mono (AC-5, Task 5.4)', () => {
    const content = '---\ntitle: My Artifact\nstatus: draft\nupdated: 2026-07-12\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    expect(badge?.querySelectorAll('.font-mono').length).toBeGreaterThan(0);
    expect(badge?.textContent).toContain('title');
    expect(badge?.textContent).toContain('My Artifact');
    expect(badge?.textContent).toContain('updated');
    expect(badge?.textContent).toContain('2026-07-12');
  });

  it('[P0] renders the status field as a pill (rounded-full) (AC-5, Task 5.5)', () => {
    const content = '---\ntitle: My Artifact\nstatus: draft\nupdated: 2026-07-12\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    const statusPill = badge?.querySelector('.rounded-full');
    expect(statusPill).toBeInTheDocument();
    expect(statusPill?.textContent).toContain('draft');
  });

  it('[P0] does NOT render a badge when content has no frontmatter (AC-5, Task 5.6)', () => {
    const content = '# Hello World';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).not.toBeInTheDocument();
  });

  it('[P1] skips absent frontmatter fields (only title, no status/updated) (AC-5, Task 5.5)', () => {
    const content = '---\ntitle: Only Title\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toContain('title');
    expect(badge?.textContent).toContain('Only Title');
    expect(badge?.textContent).not.toContain('status');
    expect(badge?.textContent).not.toContain('updated');
  });

  it('[P1] badge renders above the Markdown content (AC-5, Task 5.2)', () => {
    const content = '---\ntitle: My Artifact\n---\n# Hello';
    const { container } = render(<ArtifactViewer content={content} />);
    const badge = container.querySelector('[aria-label="Artifact metadata"]');
    const markdown = container.querySelector('[data-testid="markdown"]');
    expect(badge).toBeInTheDocument();
    expect(markdown).toBeInTheDocument();
    expect(badge?.compareDocumentPosition(markdown as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});

// ─── Bug-hunt B2: parseFrontmatter quote-strip ───────────────────────────────
//
// YAML frontmatter values may be quoted with single or double quotes.
// parseFrontmatter must strip surrounding quotes so the metadata badge
// renders the bare value (e.g. `PRD: Onboarding Flow`, not `"PRD: Onboarding Flow"`).
// Internal quotes are preserved; only a leading/trailing quote is stripped.

describe('ArtifactViewer — parseFrontmatter quote-stripping (Bug-hunt B2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] strips surrounding double-quotes from frontmatter values', () => {
    const content = '---\ntitle: "PRD: Onboarding Flow"\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toContain('PRD: Onboarding Flow');
    expect(badge?.textContent).not.toContain('"PRD: Onboarding Flow"');
    expect(badge?.textContent).not.toMatch(/"[A-Z]/);
  });

  it('[P0] strips surrounding single-quotes from frontmatter values', () => {
    const content = "---\ntitle: 'My Title'\n---\n# Hello";
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toContain('My Title');
    expect(badge?.textContent).not.toContain("'My Title'");
  });

  it('[P0] leaves unquoted frontmatter values unchanged', () => {
    const content = '---\ntitle: My Unquoted Title\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toContain('My Unquoted Title');
  });

  it('[P1] does not strip quotes from the middle of an unquoted value', () => {
    const content = '---\ntitle: My "quoted" word\n---\n# Hello';
    render(<ArtifactViewer content={content} />);
    const badge = document.querySelector('[aria-label="Artifact metadata"]');
    expect(badge).toBeInTheDocument();
    expect(badge?.textContent).toContain('My "quoted" word');
  });
});

// ─── Story 5.4: Hairline border token (AC-6) ─────────────────────────────────
//
// Story 5.4: AC-6: h2 separator and hr use border-surface-raised (not border-border-subtle).
// Since react-markdown is mocked, we test the component override functions
// from the `components` prop by rendering their output directly.
// Tests are active (GREEN) after Story 5.4 implementation.

describe('ArtifactViewer — hairline border tokens (Story 5.4, AC-6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] h2 separator uses border-surface-raised, not border-border-subtle (AC-6)', () => {
    render(<ArtifactViewer content="# Hello" />);
    const callArgs = mockMarkdown.mock.calls[0][0] as {
      components?: Record<string, (props: Record<string, unknown>) => React.ReactElement>;
    };
    const H2 = callArgs.components!.h2;
    const { container } = render(H2({ node: null, children: 'Heading' }));
    const h2 = container.querySelector('h2');
    expect(h2).not.toBeNull();
    expect(h2!.className).toContain('border-surface-raised');
    expect(h2!.className).not.toContain('border-border-subtle');
  });

  it('[P0] hr element uses border-surface-raised, not border-border-subtle (AC-6)', () => {
    render(<ArtifactViewer content="# Hello" />);
    const callArgs = mockMarkdown.mock.calls[0][0] as {
      components?: Record<string, (props: Record<string, unknown>) => React.ReactElement>;
    };
    const Hr = callArgs.components!.hr;
    const { container } = render(Hr({ node: null }));
    const hr = container.querySelector('hr');
    expect(hr).not.toBeNull();
    expect(hr!.className).toContain('border-surface-raised');
    expect(hr!.className).not.toContain('border-border-subtle');
  });
});
