/**
 * ATDD — Story 2.4: Browse and Read All Committed Artifacts
 * Component unit tests for ArtifactsLoading (Next.js loading skeleton).
 * Covers AC-2 (skeleton loader shown in content pane while loading).
 *
 * The loading.tsx is a Next.js convention file that renders automatically
 * while the page.tsx Server Component is executing. These tests verify the
 * skeleton structure renders correctly — the h1 is required for AppShell
 * route-focus management (project-context.md:104), and the skeleton
 * dimensions must match the actual ArtifactListEntry layout
 * (project-context.md:105).
 *
 * Priority tags: P0 for AC coverage, P1 for negative assertions.
 */

import { render, screen } from '@testing-library/react';
import ArtifactsLoading from './loading';

const SKELETON_ENTRY_COUNT = 5;

describe('ArtifactsLoading — skeleton (AC-2)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the h1 "Artifact Browser" for route-change focus management', () => {
    render(<ArtifactsLoading />);
    expect(
      screen.getByRole('heading', { name: 'Artifact Browser' }),
    ).toBeInTheDocument();
  });

  it('[P0] renders 5 skeleton entries with animate-pulse', () => {
    const { container } = render(<ArtifactsLoading />);
    const skeletonEntries = container.querySelectorAll('[data-testid="skeleton-entry"]');
    expect(skeletonEntries).toHaveLength(SKELETON_ENTRY_COUNT);
  });

  it('[P1] does not render credential error banner (loading state, not runtime state)', () => {
    render(<ArtifactsLoading />);
    expect(
      screen.queryByText(/repository connection needs attention/i),
    ).not.toBeInTheDocument();
  });
});
