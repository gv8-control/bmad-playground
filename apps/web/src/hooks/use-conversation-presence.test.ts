/**
 * @jest-environment jsdom
 *
 * Story 3.5: Resume an Existing Conversation
 * Unit tests for useConversationPresence and useOpenConversations hooks.
 *
 * Covers AC-3 (Focus existing Conversation tab from Project Map — FR8):
 * - Cross-tab BroadcastChannel communication
 * - conversation-opened / conversation-closed broadcasting
 * - focus-conversation listener → window.focus()
 * - useOpenConversations tracking and deduplication
 * - SSR / unsupported browser no-op
 *
 * TDD GREEN PHASE: All tests un-skipped and passing.
 */

import { renderHook, act } from '@testing-library/react';
import {
  useConversationPresence,
  useOpenConversations,
  CONVERSATION_CHANNEL,
} from './use-conversation-presence';

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];

  static reset(): void {
    MockBroadcastChannel.instances = [];
  }

  readonly name: string;
  private readonly target: EventTarget;

  constructor(name: string) {
    this.name = name;
    this.target = new EventTarget();
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    const event = new MessageEvent('message', { data });
    this.target.dispatchEvent(event);
    for (const instance of MockBroadcastChannel.instances) {
      if (instance !== this && instance.name === this.name) {
        instance.target.dispatchEvent(new MessageEvent('message', { data }));
      }
    }
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    this.target.addEventListener(type, listener);
  }

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
  ): void {
    this.target.removeEventListener(type, listener);
  }

  close(): void {
    // no-op — mock cleanup
  }
}

describe('useConversationPresence and useOpenConversations', () => {
  const originalBroadcastChannel = global.BroadcastChannel;

  beforeEach(() => {
    jest.clearAllMocks();
    MockBroadcastChannel.reset();
    global.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.BroadcastChannel = originalBroadcastChannel;
  });

  describe('useConversationPresence', () => {
    it('[P0] broadcasts conversation-opened on mount', () => {
      const postMessageSpy = jest.spyOn(
        MockBroadcastChannel.prototype,
        'postMessage',
      );

      renderHook(() => useConversationPresence('conv-1'));

      expect(MockBroadcastChannel.instances).toHaveLength(1);
      expect(MockBroadcastChannel.instances[0].name).toBe(CONVERSATION_CHANNEL);
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'conversation-opened',
        conversationId: 'conv-1',
      });
    });

    it('[P0] broadcasts conversation-closed on unmount', () => {
      const postMessageSpy = jest.spyOn(
        MockBroadcastChannel.prototype,
        'postMessage',
      );

      const { unmount } = renderHook(() => useConversationPresence('conv-1'));

      postMessageSpy.mockClear();
      unmount();

      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'conversation-closed',
        conversationId: 'conv-1',
      });
    });

    it('[P0] calls window.focus() on focus-conversation message', () => {
      const focusSpy = jest.spyOn(window, 'focus');

      renderHook(() => useConversationPresence('conv-1'));

      const otherTab = new MockBroadcastChannel(CONVERSATION_CHANNEL);
      act(() => {
        otherTab.postMessage({
          type: 'focus-conversation',
          conversationId: 'conv-1',
        });
      });

      expect(focusSpy).toHaveBeenCalled();
    });

    it('[P1] is a no-op when conversationId is null', () => {
      renderHook(() => useConversationPresence(null));

      expect(MockBroadcastChannel.instances).toHaveLength(0);
    });

    it('[P1] is a no-op when BroadcastChannel is unavailable', () => {
      const saved = global.BroadcastChannel;
      global.BroadcastChannel = undefined as unknown as typeof BroadcastChannel;

      expect(() => {
        renderHook(() => useConversationPresence('conv-1'));
      }).not.toThrow();

      expect(MockBroadcastChannel.instances).toHaveLength(0);

      global.BroadcastChannel = saved;
    });
  });

  describe('useOpenConversations', () => {
    it('[P0] useOpenConversations returns open conversation IDs', () => {
      const { result } = renderHook(() => useOpenConversations());

      const otherTab = new MockBroadcastChannel(CONVERSATION_CHANNEL);

      act(() => {
        otherTab.postMessage({
          type: 'conversation-opened',
          conversationId: 'conv-1',
        });
      });

      expect(result.current).toEqual(['conv-1']);

      act(() => {
        otherTab.postMessage({
          type: 'conversation-opened',
          conversationId: 'conv-2',
        });
      });

      expect(result.current).toEqual(['conv-2', 'conv-1']);
    });

    it('[P1] deduplicates conversation-opened messages', () => {
      const { result } = renderHook(() => useOpenConversations());

      const otherTab = new MockBroadcastChannel(CONVERSATION_CHANNEL);

      act(() => {
        otherTab.postMessage({
          type: 'conversation-opened',
          conversationId: 'conv-1',
        });
      });

      act(() => {
        otherTab.postMessage({
          type: 'conversation-opened',
          conversationId: 'conv-1',
        });
      });

      expect(result.current).toEqual(['conv-1']);
    });
  });
});
