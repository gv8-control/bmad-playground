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

  it('[P0] uses new-conversation-draft key when conversationId is null', async () => {
    store['new-conversation-draft'] = 'new draft';

    const { result } = renderHook(() => useDraftPersistence(null));

    await waitFor(() => {
      expect(result.current.draft).toBe('new draft');
    });
    expect(Storage.prototype.getItem).toHaveBeenCalledWith('new-conversation-draft');
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
