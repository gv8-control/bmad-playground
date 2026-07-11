/**
 * @jest-environment jsdom
 *
 * Story 3.7: Receive Real-Time Credential Failure Alerts Mid-Conversation
 * Unit tests for AccessNotice component.
 *
 * Covers AC-4: error-state Tool Pill + Access Notice, no banner, no halt.
 * Verifies copy derivation per code, retry hint, dismiss behavior,
 * color tokens, and accessibility attributes.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { AccessNotice } from './AccessNotice';
import type { AccessNoticeData } from './types';

describe('AccessNotice', () => {
  describe('[P0] Copy derivation per code', () => {
    it('renders correct copy for RATE_LIMITED code', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED' };
      render(<AccessNotice notice={notice} />);
      expect(
        screen.getByText(/GitHub is rate-limiting this request/),
      ).toBeInTheDocument();
    });

    it('renders correct copy for ORG_RESTRICTION code', () => {
      const notice: AccessNoticeData = { code: 'ORG_RESTRICTION' };
      render(<AccessNotice notice={notice} />);
      expect(
        screen.getByText(/Your organization hasn't approved this app/),
      ).toBeInTheDocument();
    });

    it('renders correct copy for INSUFFICIENT_PERMISSION code', () => {
      const notice: AccessNoticeData = { code: 'INSUFFICIENT_PERMISSION' };
      render(<AccessNotice notice={notice} />);
      expect(
        screen.getByText(/Your account doesn't have access to this resource/),
      ).toBeInTheDocument();
    });
  });

  describe('[P0] Retry hint', () => {
    it('renders retry hint when retryAfter is present and code is RATE_LIMITED', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED', retryAfter: 60 };
      render(<AccessNotice notice={notice} />);
      expect(screen.getByText(/retry in ~60s/)).toBeInTheDocument();
    });

    it('does NOT render retry hint when retryAfter is absent', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED' };
      render(<AccessNotice notice={notice} />);
      expect(screen.queryByText(/retry in/)).not.toBeInTheDocument();
    });
  });

  describe('[P0] Dismiss behavior', () => {
    it('Dismiss button hides the notice on click', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED' };
      render(<AccessNotice notice={notice} />);
      const dismissButton = screen.getByRole('button', { name: /dismiss notice/i });
      fireEvent.click(dismissButton);
      expect(
        screen.queryByText(/GitHub is rate-limiting this request/),
      ).not.toBeInTheDocument();
    });
  });

  describe('[P0] Color tokens', () => {
    it('uses caution-bg / caution border for RATE_LIMITED', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED' };
      render(<AccessNotice notice={notice} />);
      const status = screen.getByRole('status');
      expect(status.className).toContain('caution-bg');
      expect(status.className).toContain('caution');
    });

    it('uses caution-bg / caution border for ORG_RESTRICTION', () => {
      const notice: AccessNoticeData = { code: 'ORG_RESTRICTION' };
      render(<AccessNotice notice={notice} />);
      const status = screen.getByRole('status');
      expect(status.className).toContain('caution-bg');
      expect(status.className).toContain('caution');
    });

    it('uses negative-bg / negative border for INSUFFICIENT_PERMISSION', () => {
      const notice: AccessNoticeData = { code: 'INSUFFICIENT_PERMISSION' };
      render(<AccessNotice notice={notice} />);
      const status = screen.getByRole('status');
      expect(status.className).toContain('negative-bg');
      expect(status.className).toContain('negative');
    });
  });

  describe('[P0] Accessibility', () => {
    it('has role="status" and aria-live="polite"', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED' };
      render(<AccessNotice notice={notice} />);
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });

    it('Dismiss button has standard focus ring classes', () => {
      const notice: AccessNoticeData = { code: 'RATE_LIMITED' };
      render(<AccessNotice notice={notice} />);
      const dismissButton = screen.getByRole('button', { name: /dismiss notice/i });
      expect(dismissButton.className).toContain('focus:ring-2');
      expect(dismissButton.className).toContain('focus:ring-accent');
      expect(dismissButton.className).toContain('focus:ring-offset-2');
      expect(dismissButton.className).toContain('focus:ring-offset-surface');
    });
  });
});
