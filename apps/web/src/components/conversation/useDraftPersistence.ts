'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_DRAFT_SIZE = 10_000;

function clampDraft(value: string): string {
  return value.length > MAX_DRAFT_SIZE ? value.slice(0, MAX_DRAFT_SIZE) : value;
}

export function useDraftPersistence(conversationId: string | null) {
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const loadedForIdRef = useRef<string | null | undefined>(undefined);

  const setDraftBounded = useCallback(
    (value: string | ((prev: string) => string)) => {
      setDraft((prev) => clampDraft(typeof value === 'function' ? value(prev) : value));
    },
    [],
  );

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
      if (saved) setDraft(clampDraft(saved));
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
      localStorage.setItem(key, clampDraft(draft));
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

  return { draft, setDraft: setDraftBounded, clearDraft } as const;
}
