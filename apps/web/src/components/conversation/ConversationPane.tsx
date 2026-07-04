'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SkillInfo } from '@bmad-easy/shared-types';
import { SessionStartSpinner } from './SessionStartSpinner';
import { SlashCommandPicker } from './SlashCommandPicker';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { ThinkingIndicator } from './ThinkingIndicator';
import { useDraftPersistence } from './useDraftPersistence';
import type { ChatMessage } from './types';

type SessionState = 'init' | 'provisioning' | 'ready' | 'error' | 'timeout';
type AgentState = 'idle' | 'thinking' | 'tool-executing' | 'streaming';

const CLIENT_TIMEOUT_MS = 30_000;

export interface ConversationPaneProps {
  boundaryJwt: string;
  apiUrl: string;
  initialConversationId?: string;
  initialMessages?: ChatMessage[];
}

export function ConversationPane({
  boundaryJwt,
  apiUrl,
  initialConversationId,
  initialMessages = [],
}: ConversationPaneProps) {
  const router = useRouter();
  const [state, setState] = useState<SessionState>('init');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [agentState, setAgentState] = useState<AgentState>('idle');
  const streamingMessageIdRef = useRef<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerSelectedIndex, setPickerSelectedIndex] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const queuedMessageRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(initialConversationId ?? null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerContainerRef = useRef<HTMLDivElement>(null);

  const { draft, setDraft, clearDraft } = useDraftPersistence(
    conversationIdRef.current,
  );

  const filteredSkills = useMemo(
    () => skills.filter((s) => s.name.startsWith(pickerQuery)),
    [skills, pickerQuery],
  );

  useEffect(() => {
    void startSession();

    return () => {
      eventSourceRef.current?.close();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;

    function handleOutsideClick(e: MouseEvent) {
      if (
        pickerContainerRef.current &&
        !pickerContainerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [pickerOpen]);

  useEffect(() => {
    if (state === 'ready' && conversationIdRef.current) {
      void fetchSkills(conversationIdRef.current);
    }
  }, [state]);

  async function startSession() {
    setState('provisioning');

    let convId = initialConversationId ?? null;

    if (!convId) {
      try {
        const response = await fetch(`${apiUrl}/api/conversations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${boundaryJwt}`,
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          setState('error');
          setErrorMessage('Failed to create conversation.');
          return;
        }

        const data = (await response.json()) as { id: string };
        convId = data.id;
        conversationIdRef.current = convId;
      } catch {
        setState('error');
        setErrorMessage('Failed to connect to the server.');
        return;
      }
    }

    if (!convId) return;

    const eventSource = new EventSource(
      `${apiUrl}/api/conversations/${convId}/events?token=${boundaryJwt}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('SESSION_READY', () => {
      setState('ready');
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      const queued = queuedMessageRef.current;
      if (queued) {
        queuedMessageRef.current = null;
        setQueuedMessage(null);
        void sendMessage(queued);
      }
    });

    eventSource.addEventListener('SESSION_ERROR', (event) => {
      setState('error');
      setErrorMessage('Session failed to start.');
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data.message) setErrorMessage(data.message);
      } catch {
        // keep default error message
      }
    });

    eventSource.addEventListener('SESSION_TIMEOUT', () => {
      setState('timeout');
      setErrorMessage('Starting your session is taking longer than expected.');
    });

    eventSource.addEventListener('RUN_STARTED', () => {
      setAgentState('thinking');
    });

    eventSource.addEventListener('TEXT_MESSAGE_START', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const messageId = data.messageId ?? `msg-${Date.now()}`;
        streamingMessageIdRef.current = messageId;
        setAgentState('streaming');
        setMessages((prev) => [
          ...prev,
          {
            id: messageId,
            role: 'assistant' as const,
            content: '',
            createdAt: new Date(),
            isStreaming: true,
          },
        ]);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TEXT_MESSAGE_CONTENT', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const delta = data.delta ?? '';
        const messageId = streamingMessageIdRef.current;
        if (messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId ? { ...m, content: m.content + delta } : m,
            ),
          );
        }
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TEXT_MESSAGE_END', () => {
      const messageId = streamingMessageIdRef.current;
      if (messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, isStreaming: false } : m,
          ),
        );
      }
      streamingMessageIdRef.current = null;
    });

    eventSource.addEventListener('TOOL_CALL_START', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const toolName = data.toolName ?? 'unknown';
        setAgentState('tool-executing');
        setMessages((prev) => [
          ...prev,
          {
            id: `tool-${Date.now()}`,
            role: 'assistant' as const,
            content: `Running… ${toolName}`,
            createdAt: new Date(),
          },
        ]);
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TOOL_CALL_END', () => {
      setAgentState('thinking');
    });

    eventSource.addEventListener('RUN_FINISHED', () => {
      setAgentState('idle');
      streamingMessageIdRef.current = null;
    });

    eventSource.addEventListener('RUN_ERROR', (event) => {
      setAgentState('idle');
      streamingMessageIdRef.current = null;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant' as const,
            content: data.message ?? 'The agent stopped unexpectedly. Send a new message to try again.',
            createdAt: new Date(),
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant' as const,
            content: 'The agent stopped unexpectedly. Send a new message to try again.',
            createdAt: new Date(),
          },
        ]);
      }
    });

    eventSource.addEventListener('STREAM_ERROR', () => {
      setAgentState('idle');
      streamingMessageIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: `stream-error-${Date.now()}`,
          role: 'assistant' as const,
          content: 'Connection was slow and dropped. Please try again.',
          createdAt: new Date(),
        },
      ]);
    });

    eventSource.onerror = () => {
      setState((prev) => (prev === 'ready' ? prev : 'error'));
    };

    timeoutRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev === 'provisioning') {
          setErrorMessage('Starting your session is taking longer than expected.');
          return 'timeout';
        }
        return prev;
      });
    }, CLIENT_TIMEOUT_MS);
  }

  async function fetchSkills(convId: string) {
    try {
      const response = await fetch(`${apiUrl}/api/conversations/${convId}/skills`, {
        headers: {
          Authorization: `Bearer ${boundaryJwt}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setSkills(data);
        }
      }
    } catch {
      // skills fetch failed — picker shows empty state
    }
  }

  async function sendMessage(message: string) {
    const convId = conversationIdRef.current;
    if (!convId) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: 'user' as const,
        content: message,
        createdAt: new Date(),
      },
    ]);

    try {
      const response = await fetch(`${apiUrl}/api/conversations/${convId}/turns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${boundaryJwt}`,
        },
        body: JSON.stringify({ content: message }),
      });

      if (!response.ok) {
        setErrorMessage('Failed to send message.');
        return;
      }

      const data = (await response.json()) as { conversationId: string; title: string | null };

      setDraft('');
      clearDraft();

      if (!initialConversationId) {
        router.push(`/conversations/${data.conversationId}`);
      }
    } catch {
      setErrorMessage('Failed to send message.');
    }
  }

  async function handleStop() {
    const convId = conversationIdRef.current;
    if (!convId) return;

    try {
      await fetch(`${apiUrl}/api/conversations/${convId}/stop`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${boundaryJwt}`,
        },
      });
    } catch {
      // stop failed — UI still transitions to idle
    }
    setAgentState('idle');
  }

  function handleSelectSkill(skill: SkillInfo) {
    setDraft(`/${skill.name} `);
    setPickerOpen(false);
    inputRef.current?.focus();
  }

  function handleInputChange(value: string) {
    setDraft(value);

    if (value.startsWith('/') && !value.slice(1).includes(' ')) {
      setPickerOpen(true);
      setPickerQuery(value.slice(1));
      setPickerSelectedIndex(0);
    } else {
      setPickerOpen(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!pickerOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setPickerOpen(false);
      return;
    }

    if (filteredSkills.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPickerSelectedIndex((prev) => (prev + 1) % filteredSkills.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPickerSelectedIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const skill = filteredSkills[pickerSelectedIndex];
      if (skill) {
        handleSelectSkill(skill);
      }
    }
  }

  function handleSubmit() {
    const message = draft.trim();
    if (!message) return;

    if (state === 'provisioning') {
      queuedMessageRef.current = message;
      setQueuedMessage(message);
      setDraft('');
      return;
    }

    if (state === 'ready') {
      void sendMessage(message);
    }
  }

  function handleRetry() {
    eventSourceRef.current?.close();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    queuedMessageRef.current = null;
    setQueuedMessage(null);
    setErrorMessage(null);
    conversationIdRef.current = initialConversationId ?? null;
    void startSession();
  }

  function handleScrollToBottom() {
    setShowScrollToBottom(false);
    setNewMessageCount(0);
  }

  const inputDisabled = state === 'init' || state === 'error' || state === 'timeout';
  const showSpinner = state === 'provisioning' && queuedMessage !== null;
  const isProcessing = agentState !== 'idle';

  return (
    <div className="flex h-full flex-col">
      <ChatMessageList
        messages={messages}
        showScrollToBottom={showScrollToBottom}
        newMessageCount={newMessageCount}
        onScrollToBottom={handleScrollToBottom}
      />
      {agentState === 'thinking' && <ThinkingIndicator />}
      {errorMessage && (
        <p className="px-8 text-negative text-sm" role="alert">
          {errorMessage}
        </p>
      )}
      {state === 'timeout' && (
        <button
          onClick={handleRetry}
          className="mx-8 mb-2 rounded-md bg-accent px-4 py-2 text-sm text-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        >
          Retry
        </button>
      )}
      <div className="flex-shrink-0 border-t border-border px-8 py-4">
        {showSpinner && <SessionStartSpinner />}
        <div ref={pickerContainerRef} className="relative">
          {pickerOpen && (
            <SlashCommandPicker
              skills={filteredSkills}
              selectedIndex={pickerSelectedIndex}
              onSelect={handleSelectSkill}
            />
          )}
          <ChatInput
            value={draft}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            onStop={handleStop}
            disabled={inputDisabled}
            isProcessing={isProcessing}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
          />
        </div>
      </div>
    </div>
  );
}
