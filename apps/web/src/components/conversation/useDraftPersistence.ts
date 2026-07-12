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
        : 'new-conversation';
      let saved = localStorage.getItem(key);
      if (saved === null && !conversationId) {
        const oldSaved = localStorage.getItem('new-conversation-draft');
        if (oldSaved !== null) {
          localStorage.setItem(key, oldSaved);
          localStorage.removeItem('new-conversation-draft');
          saved = oldSaved;
        }
      }
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
        : 'new-conversation';
      localStorage.setItem(key, draft);
    } catch {
      // storage unavailable
    }
  }, [draft, conversationId, loaded]);

  function clearDraft() {
    try {
      const key = conversationId
        ? `conversation-${conversationId}-draft`
        : 'new-conversation';
      localStorage.removeItem(key);
    } catch {
      // storage unavailable
    }
    setDraft('');
  }

  return { draft, setDraft, clearDraft } as const;
}
