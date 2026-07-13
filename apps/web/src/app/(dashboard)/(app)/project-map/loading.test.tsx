/**
 * ATDD — Story 2.2: View the Project Map
 * Component unit tests for ProjectMapLoading (Next.js loading skeleton).
 * Covers AC-5 (loading skeleton, NFR-P3).
 *
 * The loading.tsx is a Next.js convention file that renders automatically
 * while the page.tsx Server Component is executing. These tests verify the
 * skeleton structure renders correctly. The E2E test for the 2-second
 * load time (E2E-03) is implemented in project-map.spec.ts.
 *
 * Priority tags: P0 for AC coverage, P1 for negative assertions.
 */

import { render, screen } from '@testing-library/react';
import ProjectMapLoading from './loading';

describe('ProjectMapLoading — skeleton (AC-5, NFR-P3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('[P0] renders the h1 "Project Map" for route-change focus management', () => {
    render(<ProjectMapLoading />);
    expect(
      screen.getByRole('heading', { name: 'Project Map' }),
    ).toBeInTheDocument();
  });

  it('[P0] renders 3 skeleton cards with animate-pulse', () => {
    const { container } = render(<ProjectMapLoading />);
    const skeletonCards = container.querySelectorAll('.animate-pulse');
    expect(skeletonCards).toHaveLength(3);
  });

  it('[P1] does not render credential error banner (loading state, not runtime state)', () => {
    render(<ProjectMapLoading />);
    expect(
      screen.queryByText(/repository connection needs attention/i),
    ).not.toBeInTheDocument();
  });

  it('[P1] does not render refresh button (Story 2.3 scope, not loading state)', () => {
    render(<ProjectMapLoading />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
