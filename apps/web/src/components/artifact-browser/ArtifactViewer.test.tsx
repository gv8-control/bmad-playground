/**
 * ATDD — Story 2.5: View a Single Artifact's Rendered Content
 * Component unit tests for ArtifactViewer (Server Component, synchronous).
 * Covers AC-1 (rendered Markdown content, read-only, role="main").
 *
 * GREEN PHASE: implementation complete. ArtifactViewer strips YAML
 * frontmatter and renders Markdown via react-markdown + remark-gfm with
 * component-level className overrides.
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
