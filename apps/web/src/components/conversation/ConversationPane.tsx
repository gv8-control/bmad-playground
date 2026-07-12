'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SkillInfo } from '@bmad-easy/shared-types';
import { SessionStartSpinner } from './SessionStartSpinner';
import { SlashCommandPicker } from './SlashCommandPicker';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';
import { WorkingTreeIndicator } from './WorkingTreeIndicator';
import type { WorkingTreeState } from './WorkingTreeIndicator';
import { useDraftPersistence } from './useDraftPersistence';
import { useConversationPresence } from '@/hooks/use-conversation-presence';
import { CredentialErrorBanner } from '@/components/project-map/CredentialErrorBanner';
import type { ChatMessage } from './types';

type SessionState = 'init' | 'provisioning' | 'ready' | 'error' | 'timeout' | 'reconnecting' | 'limit-reached';
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
  const [workingTreeState, setWorkingTreeState] = useState<WorkingTreeState>('hidden');
  const [credentialFailed, setCredentialFailed] = useState(false);
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
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const runEndedRef = useRef(false);
  const saveFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryingRef = useRef(false);
  const unmountedRef = useRef(false);

  const { draft, setDraft, clearDraft } = useDraftPersistence(
    conversationIdRef.current,
  );

  useConversationPresence(conversationId);

  const filteredSkills = useMemo(
    () => skills.filter((s) => s.name.startsWith(pickerQuery)),
    [skills, pickerQuery],
  );

  useEffect(() => {
    void startSession();

    return () => {
      unmountedRef.current = true;
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

  useEffect(() => {
    if (!isAtBottomRef.current && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role !== 'user') {
        setShowScrollToBottom(true);
        setNewMessageCount((prev) => prev + 1);
      }
    }
  }, [messages.length]);

  async function startSession() {
    unmountedRef.current = false;
    const isResume = conversationIdRef.current !== null;
    setState(isResume ? 'reconnecting' : 'provisioning');
    setCredentialFailed(false);

    let convId = conversationIdRef.current;

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
        if (response.status === 409) {
          let code: string | undefined;
          let message: string | undefined;
          try {
            const body = await response.json();
            code = body.code;
            message = body.message;
          } catch {
            // not JSON — fall through to generic error
          }
          if (code === 'CONVERSATION_LIMIT_REACHED') {
            setState('limit-reached');
            setErrorMessage(
              message ??
                "You've reached the limit of active conversations. Return to one of your existing conversations, or try again later.",
            );
            return;
          }
        }
          setState('error');
          setErrorMessage('Failed to create conversation.');
          return;
        }

        const data = (await response.json()) as { id: string };
        convId = data.id;
        conversationIdRef.current = convId;
        setConversationId(convId);
      } catch {
        setState('error');
        setErrorMessage('Failed to connect to the server.');
        return;
      }
    }

    if (!convId) {
      setState('error');
      setErrorMessage('Failed to create conversation.');
      return;
    }

    if (unmountedRef.current) return;

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

    eventSource.addEventListener('SESSION_TIMEOUT', (event) => {
      setState('timeout');
      try {
        const data = JSON.parse((event as MessageEvent).data);
        if (data.reason === 'mid-session') {
          setErrorMessage('Your session expired due to inactivity.');
        } else {
          setErrorMessage('Starting your session is taking longer than expected.');
        }
      } catch {
        setErrorMessage('Starting your session is taking longer than expected.');
      }
    });

    eventSource.addEventListener('SESSION_DRAINING', () => {
      setState('reconnecting');
      timeoutRef.current = setTimeout(() => {
        setState((prev) => {
          if (prev === 'reconnecting') {
            setErrorMessage('Starting your session is taking longer than expected.');
            return 'timeout';
          }
          return prev;
        });
      }, CLIENT_TIMEOUT_MS);
    });

    eventSource.addEventListener('RUN_STARTED', () => {
      runEndedRef.current = false;
      setAgentState('thinking');
    });

    eventSource.addEventListener('TEXT_MESSAGE_START', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const messageId = data.messageId ?? `msg-${Date.now()}`;
        streamingMessageIdRef.current = messageId;
        setAgentState('streaming');
        setMessages((prev) => {
          if (prev.some((m) => m.id === messageId)) {
            return prev.map((m) =>
              m.id === messageId ? { ...m, content: '', isStreaming: true } : m,
            );
          }
          return [
            ...prev,
            {
              id: messageId,
              role: 'assistant' as const,
              content: '',
              createdAt: new Date(),
              isStreaming: true,
            },
          ];
        });
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
        const toolCallName = data.toolCallName ?? 'unknown';
        const toolCallId = data.toolCallId ?? `tc-${Date.now()}`;
        setAgentState('tool-executing');
        setMessages((prev) => {
          if (prev.some((m) => m.id === toolCallId)) {
            return prev.map((m) =>
              m.id === toolCallId && m.toolCall
                ? { ...m, toolCall: { ...m.toolCall, input: '', output: '', status: 'running' as const } }
                : m,
            );
          }
          return [
            ...prev,
            {
              id: toolCallId,
              role: 'assistant' as const,
              content: '',
              createdAt: new Date(),
              toolCall: {
                toolCallId,
                toolName: toolCallName,
                status: 'running',
                input: '',
                output: '',
              },
            },
          ];
        });
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TOOL_CALL_ARGS', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, delta } = data;
        if (!toolCallId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === toolCallId && m.toolCall
              ? { ...m, toolCall: { ...m.toolCall, input: m.toolCall.input + (delta ?? '') } }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TOOL_CALL_END', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId } = data;
        if (toolCallId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === toolCallId && m.toolCall
                ? { ...m, toolCall: { ...m.toolCall, status: 'completed' as const } }
                : m,
            ),
          );
          setAgentState('thinking');
        }
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TOOL_CALL_RESULT', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, content } = data;
        if (!toolCallId) return;
        const isError =
          data.isError === true ||
          (typeof content === 'string' &&
            (/^error:/im.test(content) ||
              /Command exited with code [1-9]/.test(content) ||
              /failed to push/i.test(content)));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === toolCallId && m.toolCall
              ? {
                  ...m,
                  toolCall: {
                    ...m.toolCall,
                    output: content ?? '',
                    status: isError ? ('error' as const) : m.toolCall.status,
                    errorMessage: isError ? content : m.toolCall.errorMessage,
                  },
                }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('TOOL_CALL_PROMOTED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, artifactType, artifactTitle, viewHref } = data;
        if (!toolCallId) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === toolCallId && m.toolCall
              ? {
                  ...m,
                  toolCall: {
                    ...m.toolCall,
                    status: 'completed' as const,
                    semantic: { artifactType, artifactTitle, viewHref },
                  },
                }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('RUN_FINISHED', () => {
      runEndedRef.current = true;
      setAgentState('idle');
      streamingMessageIdRef.current = null;
    });

    eventSource.addEventListener('RUN_ERROR', (event) => {
      if (runEndedRef.current) return;
      runEndedRef.current = true;
      setAgentState('idle');
      streamingMessageIdRef.current = null;
      try {
        const data = JSON.parse((event as MessageEvent).data);
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'system' as const,
            content: data.message ?? 'The agent stopped unexpectedly. Send a new message to try again.',
            createdAt: new Date(),
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'system' as const,
            content: 'The agent stopped unexpectedly. Send a new message to try again.',
            createdAt: new Date(),
          },
        ]);
      }
    });

    eventSource.addEventListener('STREAM_ERROR', () => {
      if (runEndedRef.current) return;
      runEndedRef.current = true;
      setAgentState('idle');
      streamingMessageIdRef.current = null;
      setMessages((prev) => [
        ...prev,
        {
          id: `stream-error-${Date.now()}`,
          role: 'system' as const,
          content: 'Connection was slow and dropped. Please try again.',
          createdAt: new Date(),
        },
      ]);
    });

    eventSource.addEventListener('WORKING_TREE_DIRTY', () => {
      setWorkingTreeState('dirty');
    });

    eventSource.addEventListener('WORKING_TREE_CLEAN', () => {
      setWorkingTreeState('clean');
    });

    eventSource.addEventListener('MANUAL_SAVE_SUCCEEDED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId } = data;
        const id = toolCallId || `manual-save-${Date.now()}`;
        if (saveFallbackTimeoutRef.current) {
          clearTimeout(saveFallbackTimeoutRef.current);
          saveFallbackTimeoutRef.current = null;
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev;
          return [
            ...prev,
            {
              id,
              role: 'assistant' as const,
              content: '',
              createdAt: new Date(),
              toolCall: {
                toolCallId: id,
                toolName: 'Save',
                status: 'completed' as const,
                input: '',
                output: '',
                semantic: { artifactType: '', artifactTitle: '', viewHref: '' },
              },
            },
          ];
        });
        setWorkingTreeState('clean');
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('MANUAL_SAVE_FAILED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, error } = data;
        const id = toolCallId || `manual-save-${Date.now()}`;
        if (saveFallbackTimeoutRef.current) {
          clearTimeout(saveFallbackTimeoutRef.current);
          saveFallbackTimeoutRef.current = null;
        }
        setMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev;
          return [
            ...prev,
            {
              id,
              role: 'assistant' as const,
              content: '',
              createdAt: new Date(),
              toolCall: {
                toolCallId: id,
                toolName: 'Save',
                status: 'error' as const,
                input: '',
                output: '',
                errorMessage: error ?? 'Save failed',
              },
            },
          ];
        });
        setWorkingTreeState('dirty');
      } catch {
        // ignore parse errors
      }
    });

    eventSource.addEventListener('CREDENTIAL_FAILURE', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId } = data;
        setMessages((prev) =>
          prev.map((m) =>
            m.toolCall && m.toolCall.toolCallId === toolCallId
              ? {
                  ...m,
                  toolCall: {
                    ...m.toolCall,
                    status: 'error' as const,
                    errorMessage: 'GitHub credentials have expired or been revoked.',
                  },
                }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
      setCredentialFailed(true);
    });

    eventSource.addEventListener('ACCESS_DENIED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, code, retryAfter } = data;
        setMessages((prev) =>
          prev.map((m) =>
            m.toolCall && m.toolCall.toolCallId === toolCallId
              ? {
                  ...m,
                  toolCall: {
                    ...m.toolCall,
                    status: 'error' as const,
                    errorMessage: 'Access denied.',
                    accessNotice: { code, retryAfter },
                  },
                }
              : m,
          ),
        );
      } catch {
        // ignore parse errors
      }
    });

    eventSource.onerror = () => {
      setAgentState((prev) => prev !== 'idle' ? 'idle' : prev);
      setState((prev) =>
        prev === 'ready' || prev === 'timeout' || prev === 'reconnecting'
          ? prev
          : 'error',
      );
    };

    if (isResume) {
      void fetch(`${apiUrl}/api/conversations/${convId}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${boundaryJwt}`,
        },
        body: '{}',
      }).then((response) => {
        if (!response.ok) {
          setState('error');
          setErrorMessage('Failed to resume conversation.');
        }
      }).catch(() => {
        setState('error');
        setErrorMessage('Failed to resume conversation.');
      });
    }

    timeoutRef.current = setTimeout(() => {
      setState((prev) => {
        if (prev === 'provisioning' || prev === 'reconnecting') {
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

      if (!data.conversationId) {
        setErrorMessage('Failed to send message.');
        return;
      }

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

  async function handleSave() {
    const convId = conversationIdRef.current;
    if (!convId) return;

    setWorkingTreeState('saving');

    try {
      const response = await fetch(`${apiUrl}/api/conversations/${convId}/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${boundaryJwt}`,
        },
        body: '{}',
      });

      if (!response.ok) {
        setWorkingTreeState('dirty');
        return;
      }

      const data = (await response.json()) as { committed: boolean; clean: boolean; queued: boolean };

      if (data.queued) {
        setWorkingTreeState('saving-after-response');
      } else if (data.committed) {
        // MANUAL_SAVE_SUCCEEDED SSE event will set 'clean' + add the Semantic Pill.
        // Fallback: if no SSE event arrives within 15s, assume success and clear.
        saveFallbackTimeoutRef.current = setTimeout(() => {
          setWorkingTreeState('clean');
          saveFallbackTimeoutRef.current = null;
        }, 15_000);
      } else if (data.clean) {
        setWorkingTreeState('clean');
      } else {
        // MANUAL_SAVE_FAILED SSE event will set 'dirty' + add the error Tool Pill
        setWorkingTreeState('dirty');
      }
    } catch {
      setWorkingTreeState('dirty');
    }
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

  async function handleRetry() {
    if (retryingRef.current) return;
    retryingRef.current = true;

    eventSourceRef.current?.close();
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    queuedMessageRef.current = null;
    setQueuedMessage(null);
    setErrorMessage(null);

    if (!initialConversationId && conversationIdRef.current) {
      const oldId = conversationIdRef.current;
      conversationIdRef.current = null;
      setConversationId(null);
      try {
        await fetch(`${apiUrl}/api/conversations/${oldId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${boundaryJwt}` },
        });
      } catch {
        // best-effort cleanup — don't block retry on cleanup failure
      }
    }

    void startSession().finally(() => {
      retryingRef.current = false;
    });
  }

  function handleScrollToBottom() {
    setShowScrollToBottom(false);
    setNewMessageCount(0);
  }

  function handleScrollPositionChange(isAtBottom: boolean) {
    isAtBottomRef.current = isAtBottom;
    if (isAtBottom) {
      setShowScrollToBottom(false);
      setNewMessageCount(0);
    } else {
      setShowScrollToBottom(true);
    }
  }

  const inputDisabled = state === 'init' || state === 'error' || state === 'timeout' || state === 'reconnecting' || state === 'limit-reached' || agentState !== 'idle';
  const showSpinner = (state === 'provisioning' && queuedMessage !== null) || state === 'reconnecting';
  const isProcessing = agentState !== 'idle';
  const isThinking = agentState === 'thinking';
  const effectiveWorkingTreeState = state === 'ready' ? workingTreeState : 'hidden';

  return (
    <div className="flex h-full flex-col">
      {credentialFailed && (
        <CredentialErrorBanner
          callbackUrl={typeof window !== 'undefined' ? window.location.pathname : undefined}
        />
      )}
      <ChatMessageList
        messages={messages}
        showScrollToBottom={showScrollToBottom}
        newMessageCount={newMessageCount}
        onScrollToBottom={handleScrollToBottom}
        onScrollPositionChange={handleScrollPositionChange}
        isThinking={isThinking}
      />
      {errorMessage && (
        <p className="px-8 text-negative text-sm" role="alert">
          {errorMessage}
        </p>
      )}
      {(state === 'timeout' || state === 'error') && (
        <button
          onClick={handleRetry}
          className="mx-8 mb-2 rounded-md bg-accent px-4 py-2 text-sm text-bg focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        >
          Retry
        </button>
      )}
      <div className="flex-shrink-0 border-t border-border px-8 py-4">
        {showSpinner && (
          state === 'reconnecting' ? (
            <SessionStartSpinner label="Reconnecting…" />
          ) : (
            <SessionStartSpinner />
          )
        )}
        <div ref={pickerContainerRef} className="relative">
          {pickerOpen && (
            <SlashCommandPicker
              skills={filteredSkills}
              selectedIndex={pickerSelectedIndex}
              onSelect={handleSelectSkill}
            />
          )}
          {state !== 'limit-reached' && (
            <ChatInput
              value={draft}
              onChange={handleInputChange}
              onSubmit={handleSubmit}
              onStop={handleStop}
              disabled={inputDisabled}
              isProcessing={isProcessing}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              ariaActivedescendant={pickerOpen && filteredSkills.length > 0 ? `skill-option-${pickerSelectedIndex}` : undefined}
              ariaControls={pickerOpen ? 'skill-listbox' : undefined}
              workingTreeIndicator={<WorkingTreeIndicator state={effectiveWorkingTreeState} onSave={handleSave} />}
            />
          )}
        </div>
      </div>
    </div>
  );
}
