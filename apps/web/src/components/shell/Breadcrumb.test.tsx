/**
 * @jest-environment jsdom
 *
 * Unit tests for the Breadcrumb component.
 * Covers: renders link to /project-map with correct label and aria-label.
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
});
