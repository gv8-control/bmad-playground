'use client';

import { useEffect, useState } from 'react';

export function useDraftPersistence(conversationId: string | null) {
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) {
      setLoaded(true);
    }
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const key = conversationId
        ? `conversation-${conversationId}-draft`
        : 'new-conversation-draft';
      const saved = localStorage.getItem(key);
      if (saved) setDraft(saved);
    } catch {
      // storage unavailable
    }
  }, [conversationId, loaded]);

  useEffect(() => {
    if (!loaded) return;
    try {
      const key = conversationId
        ? `conversation-${conversationId}-draft`
        : 'new-conversation-draft';
      localStorage.setItem(key, draft);
    } catch {
      // storage unavailable
    }
  }, [draft, conversationId, loaded]);

  function clearDraft() {
    try {
      const key = conversationId
        ? `conversation-${conversationId}-draft`
        : 'new-conversation-draft';
      localStorage.removeItem(key);
    } catch {
      // storage unavailable
    }
    setDraft('');
  }

  return { draft, setDraft, clearDraft } as const;
}
