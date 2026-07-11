/**
 * @jest-environment jsdom
 *
 * Story 3.6: Track and Manually Save Working Tree State
 * Unit tests for WorkingTreeIndicator component.
 *
 * Covers: AC-1 (indicator states, aria-live), AC-2 (save confirmation popover),
 *         AC-6 (Save button disabled while saving), AC-7 (help text on dirty indicator).
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkingTreeIndicator } from './WorkingTreeIndicator';
import type { WorkingTreeState } from './WorkingTreeIndicator';

describe('WorkingTreeIndicator', () => {
  const onSave = jest.fn();

  beforeEach(() => {
    onSave.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function renderIndicator(state: WorkingTreeState) {
    return render(<WorkingTreeIndicator state={state} onSave={onSave} />);
  }

  describe('[P0] AC-1 — Dirty state rendering', () => {
    it('dirty state renders "● Unsaved changes" label', () => {
      renderIndicator('dirty');
      expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    });

    it('dirty state renders "ⓘ" info affordance', () => {
      renderIndicator('dirty');
      expect(screen.getByLabelText('Why does this matter?')).toBeInTheDocument();
    });
  });

  describe('[P0] AC-1 — Clean state rendering', () => {
    it('clean state renders "✓ All saved" and is non-interactive (no click handler)', () => {
      renderIndicator('clean');
      expect(screen.getByText(/All saved/)).toBeInTheDocument();
      expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
    });
  });

  describe('[P0] AC-1 — Hidden state rendering', () => {
    it('hidden state renders null', () => {
      const { container } = renderIndicator('hidden');
      expect(container.firstChild).toBeNull();
    });
  });

  describe('[P0] AC-1 — aria-live', () => {
    it('container has aria-live="polite"', () => {
      renderIndicator('dirty');
      const container = screen.getByText(/Unsaved changes/).closest('[aria-live]');
      expect(container).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('[P0] AC-2 — Save confirmation popover', () => {
    it('clicking dirty label opens save confirmation popover with "Save current progress?"', () => {
      renderIndicator('dirty');
      fireEvent.click(screen.getByText(/Unsaved changes/));
      expect(screen.getByText(/Save current progress\?/)).toBeInTheDocument();
    });

    it('Save button in popover calls onSave and closes popover', () => {
      renderIndicator('dirty');
      fireEvent.click(screen.getByText(/Unsaved changes/));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Save current progress\?/)).not.toBeInTheDocument();
    });

    it('Cancel closes popover without calling onSave', () => {
      renderIndicator('dirty');
      fireEvent.click(screen.getByText(/Unsaved changes/));
      fireEvent.click(screen.getByText(/cancel/i));
      expect(onSave).not.toHaveBeenCalled();
      expect(screen.queryByText(/Save current progress\?/)).not.toBeInTheDocument();
    });
  });

  describe('[P0] AC-7 — Help text on dirty indicator', () => {
    it('clicking "ⓘ" info affordance opens disclosure tooltip with help text', () => {
      renderIndicator('dirty');
      fireEvent.click(screen.getByLabelText('Why does this matter?'));
      expect(
        screen.getByText(/Unsaved changes are lost if you close this page/i),
      ).toBeInTheDocument();
    });

    it('info affordance is independently focusable (Tab reaches it separately from label)', () => {
      renderIndicator('dirty');
      const infoAffordance = screen.getByLabelText('Why does this matter?');
      expect(infoAffordance).toHaveAttribute('tabindex', '0');
    });
  });

  describe('[P0] AC-6 — Save button disabled states', () => {
    it('Save button is disabled when state is "saving"', () => {
      renderIndicator('saving');
      expect(screen.getByText(/Saving…/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('saving state renders "Saving…" text', () => {
      renderIndicator('saving');
      expect(screen.getByText(/Saving…/)).toBeInTheDocument();
    });

    it('saving-after-response state renders "Saving after response…" text (AC-3)', () => {
      renderIndicator('saving-after-response');
      expect(screen.getByText(/Saving after response…/)).toBeInTheDocument();
    });
  });

  describe('[P1] AC-2 — Focus management', () => {
    it('focus is trapped in save popover and returned to trigger on close (UX-DR16)', () => {
      renderIndicator('dirty');
      const trigger = screen.getByText(/Unsaved changes/);
      fireEvent.click(trigger);

      const saveButton = screen.getByRole('button', { name: 'Save' });
      expect(saveButton).toHaveFocus();

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });

      // Tab from last element (Cancel) wraps to first (Save)
      cancelButton.focus();
      fireEvent.keyDown(cancelButton, { key: 'Tab' });
      expect(saveButton).toHaveFocus();

      // Shift+Tab from first element (Save) wraps to last (Cancel)
      fireEvent.keyDown(saveButton, { key: 'Tab', shiftKey: true });
      expect(cancelButton).toHaveFocus();

      // Escape closes popover and returns focus to trigger
      fireEvent.keyDown(saveButton, { key: 'Escape' });
      expect(trigger).toHaveFocus();
    });
  });

  describe('[P2] AC-7 — Help-text reachability (info affordance presence by state)', () => {
    it('info affordance is absent in clean state (nothing at risk to disclose)', () => {
      renderIndicator('clean');
      expect(screen.queryByLabelText('Why does this matter?')).not.toBeInTheDocument();
    });

    it('info affordance is absent in hidden state', () => {
      renderIndicator('hidden');
      expect(screen.queryByLabelText('Why does this matter?')).not.toBeInTheDocument();
    });

    it('info affordance is present only in dirty state', () => {
      renderIndicator('dirty');
      expect(screen.getByLabelText('Why does this matter?')).toBeInTheDocument();
    });
  });

  describe('[P1] AC-7 — Info tooltip dismissal', () => {
    it('info tooltip dismissible by outside click and Escape', () => {
      renderIndicator('dirty');
      const infoAffordance = screen.getByLabelText('Why does this matter?');
      fireEvent.click(infoAffordance);
      expect(
        screen.getByText(/Unsaved changes are lost if you close this page/i),
      ).toBeInTheDocument();

      // Outside click dismisses tooltip
      fireEvent.mouseDown(document.body);
      expect(
        screen.queryByText(/Unsaved changes are lost if you close this page/i),
      ).not.toBeInTheDocument();

      // Re-open and dismiss with Escape
      fireEvent.click(infoAffordance);
      expect(
        screen.getByText(/Unsaved changes are lost if you close this page/i),
      ).toBeInTheDocument();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(
        screen.queryByText(/Unsaved changes are lost if you close this page/i),
      ).not.toBeInTheDocument();
    });
  });
});
