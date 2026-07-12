/**
 * @jest-environment jsdom
 *
 * Story 3.3: Converse with the Streaming Agent
 * Tests for useDraftPersistence hook.
 * Covers AC-6 (draft persistence keyed by conversationId).
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDraftPersistence } from './useDraftPersistence';

describe('useDraftPersistence', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store[key] ?? null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      store[key] = value;
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      delete store[key];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('[P0] restores draft from localStorage for existing conversation', async () => {
    store['conversation-conv-1-draft'] = 'saved draft';

    const { result } = renderHook(() => useDraftPersistence('conv-1'));

    await waitFor(() => {
      expect(result.current.draft).toBe('saved draft');
    });
  });

  it('[P0] uses new-conversation key when conversationId is null (Story 5.3 AC-7: key renamed from new-conversation-draft)', async () => {
    store['new-conversation'] = 'new draft';

    const { result } = renderHook(() => useDraftPersistence(null));

    await waitFor(() => {
      expect(result.current.draft).toBe('new draft');
    });
    expect(Storage.prototype.getItem).toHaveBeenCalledWith('new-conversation');
  });

  it('[P0] clears draft on clearDraft()', async () => {
    store['conversation-conv-1-draft'] = 'saved draft';

    const { result } = renderHook(() => useDraftPersistence('conv-1'));

    await waitFor(() => {
      expect(result.current.draft).toBe('saved draft');
    });

    act(() => {
      result.current.clearDraft();
    });

    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('conversation-conv-1-draft');
    expect(result.current.draft).toBe('');
  });
});

// ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────────
//
// GREEN PHASE: tests are active for Story 5.3 implementation.
//
// AC-7: Draft localStorage key is "new-conversation", not "new-conversation-draft"

describe('useDraftPersistence — Story 5.3 structural drift', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store[key] ?? null);
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      store[key] = value;
    });
    jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      delete store[key];
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('[P0] AC-7 — localStorage key is "new-conversation"', () => {
    it('uses "new-conversation" key (not "new-conversation-draft") when conversationId is null', async () => {
      store['new-conversation'] = 'new draft';

      const { result } = renderHook(() => useDraftPersistence(null));

      await waitFor(() => {
        expect(result.current.draft).toBe('new draft');
      });
      expect(Storage.prototype.getItem).toHaveBeenCalledWith('new-conversation');
    });

    it('does not use "new-conversation-draft" key when reading', async () => {
      store['new-conversation'] = 'new draft';

      const { result } = renderHook(() => useDraftPersistence(null));

      await waitFor(() => {
        expect(result.current.draft).toBe('new draft');
      });
      expect(Storage.prototype.getItem).not.toHaveBeenCalledWith('new-conversation-draft');
    });

    it('writes to "new-conversation" key (not "new-conversation-draft") when conversationId is null', async () => {
      const { result } = renderHook(() => useDraftPersistence(null));

      await waitFor(() => {
        expect(result.current.draft).toBe('');
      });

      act(() => {
        result.current.setDraft('typed text');
      });

      expect(store['new-conversation']).toBe('typed text');
      expect(store['new-conversation-draft']).toBeUndefined();
    });

    it('clearDraft removes "new-conversation" key (not "new-conversation-draft")', async () => {
      store['new-conversation'] = 'new draft';

      const { result } = renderHook(() => useDraftPersistence(null));

      await waitFor(() => {
        expect(result.current.draft).toBe('new draft');
      });

      act(() => {
        result.current.clearDraft();
      });

      expect(Storage.prototype.removeItem).toHaveBeenCalledWith('new-conversation');
      expect(Storage.prototype.removeItem).not.toHaveBeenCalledWith('new-conversation-draft');
    });
  });
});
