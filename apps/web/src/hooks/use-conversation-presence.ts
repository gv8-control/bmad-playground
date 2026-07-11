'use client';

import { useEffect, useState } from 'react';

export const CONVERSATION_CHANNEL = 'bmad-easy-conversations';

export function useConversationPresence(conversationId: string | null): void {
  useEffect(() => {
    if (!conversationId) return;
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return;

    const channel = new BroadcastChannel(CONVERSATION_CHANNEL);

    channel.postMessage({ type: 'conversation-opened', conversationId });

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (
        data &&
        typeof data === 'object' &&
        data.type === 'focus-conversation' &&
        data.conversationId === conversationId
      ) {
        window.focus();
      }
    }

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.postMessage({ type: 'conversation-closed', conversationId });
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [conversationId]);
}

export function useOpenConversations(): string[] {
  const [openConversations, setOpenConversations] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return;

    const channel = new BroadcastChannel(CONVERSATION_CHANNEL);

    function handleMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'conversation-opened' && typeof data.conversationId === 'string') {
        setOpenConversations((prev) => {
          if (prev.includes(data.conversationId)) return prev;
          return [data.conversationId, ...prev];
        });
      } else if (data.type === 'conversation-closed' && typeof data.conversationId === 'string') {
        setOpenConversations((prev) => prev.filter((id) => id !== data.conversationId));
      }
    }

    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, []);

  return openConversations;
}
