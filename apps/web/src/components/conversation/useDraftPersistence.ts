'use client';

import { useEffect, useRef, useState } from 'react';

export function useDraftPersistence(conversationId: string | null) {
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const loadedForIdRef = useRef<string | null | undefined>(undefined);

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
      else setDraft('');
    } catch {
      // storage unavailable
    }
    loadedForIdRef.current = conversationId;
  }, [conversationId, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (loadedForIdRef.current !== conversationId) return;
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
