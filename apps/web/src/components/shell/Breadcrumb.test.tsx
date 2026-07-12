/**
 * @jest-environment jsdom
 *
 * Unit tests for the Breadcrumb component.
 * Covers: renders link to /project-map with correct label and aria-label.
 * Story 5.2 covers: AC-7 (breadcrumb renders inline beside page title —
 * nav no longer has padding/flex-shrink-0 classes).
 *
 * GREEN PHASE: Story 5.2 tests are active and passing.
 */

import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Breadcrumb } from './Breadcrumb';

describe('Breadcrumb', () => {
  it('[P0] renders a nav with aria-label="Breadcrumb"', () => {
    render(<Breadcrumb />);
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
  });

  it('[P0] renders a link to /project-map', () => {
    render(<Breadcrumb />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/project-map');
  });

  it('[P0] renders the "← Project Map" label text', () => {
    render(<Breadcrumb />);
    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('← Project Map');
  });

  describe('[P0] Story 5.2 — Breadcrumb inline layout (AC-7)', () => {
    it('nav does NOT have px-8 padding (padding moved to header)', () => {
      render(<Breadcrumb />);
      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav.className).not.toContain('px-8');
    });

    it('nav does NOT have py-4 padding (padding moved to header)', () => {
      render(<Breadcrumb />);
      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav.className).not.toContain('py-4');
    });

    it('nav does NOT have flex-shrink-0 (inline element, not flex child)', () => {
      render(<Breadcrumb />);
      const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
      expect(nav.className).not.toContain('flex-shrink-0');
    });
  });
});
