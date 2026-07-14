'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SkillInfo } from '@bmad-easy/shared-types';
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

function safeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export interface ConversationPaneProps {
  boundaryJwt: string;
  apiUrl: string;
  initialConversationId?: string;
  initialMessages?: ChatMessage[];
  placeholder?: string;
}

export function ConversationPane({
  boundaryJwt,
  apiUrl,
  initialConversationId,
  initialMessages = [],
  placeholder = 'Message bmad-easy…',
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
                "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later.",
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
              m.id === messageId ? { ...m, isStreaming: true } : m,
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
              segments: [{ type: 'text' as const, content: '' }],
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
            prev.map((m) => {
              if (m.id !== messageId) return m;
              if (!m.segments) return { ...m, content: m.content + delta, segments: [{ type: 'text' as const, content: m.content + delta }] };
              const newSegments = [...m.segments];
              const last = newSegments[newSegments.length - 1];
              if (last && last.type === 'text') {
                newSegments[newSegments.length - 1] = { type: 'text' as const, content: last.content + delta };
              } else {
                newSegments.push({ type: 'text' as const, content: delta });
              }
              return { ...m, content: m.content + delta, segments: newSegments };
            }),
          );
        } else if (delta) {
          // Defense-in-depth: TEXT_MESSAGE_CONTENT should always follow TEXT_MESSAGE_START.
          // Silent drop indicates an upstream protocol violation (or a race with EventSource reconnect).
          console.warn('[ConversationPane] TEXT_MESSAGE_CONTENT delta dropped — no streamingMessageIdRef set');
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
        const toolCallId = data.toolCallId ?? safeUUID();
        setAgentState('tool-executing');
        const streamingId = streamingMessageIdRef.current;
        if (streamingId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== streamingId) return m;
              const segs = m.segments ?? [{ type: 'text' as const, content: '' }];
              const existingIdx = segs.findIndex(
                (s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId,
              );
              if (existingIdx >= 0) return m;
              return {
                ...m,
                segments: [...segs, { type: 'tool_call' as const, toolCall: { toolCallId, toolName: toolCallName, status: 'running' as const, input: '', output: '' } }],
              };
            }),
          );
        } else {
          const newMsgId = `msg-${Date.now()}`;
          setMessages((prev) => {
            const hasToolCall = prev.some(
              (m) => m.segments?.some((s) => s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId),
            );
            if (hasToolCall) return prev;
            return [...prev, {
              id: newMsgId,
              role: 'assistant' as const,
              content: '',
              createdAt: new Date(),
              segments: [
                { type: 'text' as const, content: '' },
                { type: 'tool_call' as const, toolCall: { toolCallId, toolName: toolCallName, status: 'running' as const, input: '', output: '' } },
              ],
            }];
          });
          streamingMessageIdRef.current = newMsgId;
        }
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
          prev.map((m) => {
            if (!m.segments) return m;
            let found = false;
            const newSegments = m.segments.map((s) => {
              if (s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId) {
                found = true;
                return { ...s, toolCall: { ...s.toolCall, input: s.toolCall.input + (delta ?? '') } };
              }
              return s;
            });
            return found ? { ...m, segments: newSegments } : m;
          }),
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
            prev.map((m) => {
              if (!m.segments) return m;
              let found = false;
              const newSegments = m.segments.map((s) => {
                if (s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId) {
                  found = true;
                  const nextStatus: 'error' | 'completed' = s.toolCall.status === 'error' ? 'error' : 'completed';
                  return { ...s, toolCall: { ...s.toolCall, status: nextStatus } };
                }
                return s;
              });
              return found ? { ...m, segments: newSegments } : m;
            }),
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
          prev.map((m) => {
            if (!m.segments) return m;
            let found = false;
            const newSegments = m.segments.map((s) => {
              if (s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId) {
                found = true;
                return {
                  ...s,
                  toolCall: {
                    ...s.toolCall,
                    output: content ?? '',
                    status: isError ? ('error' as const) : s.toolCall.status,
                    errorMessage: isError ? content : s.toolCall.errorMessage,
                  },
                };
              }
              return s;
            });
            return found ? { ...m, segments: newSegments } : m;
          }),
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
          prev.map((m) => {
            if (!m.segments) return m;
            let found = false;
            const newSegments = m.segments.map((s) => {
              if (s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId) {
                found = true;
                return {
                  ...s,
                  toolCall: {
                    ...s.toolCall,
                    status: 'completed' as const,
                    semantic: { artifactType, artifactTitle, viewHref },
                  },
                };
              }
              return s;
            });
            return found ? { ...m, segments: newSegments } : m;
          }),
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
        const id = toolCallId || safeUUID();
        if (saveFallbackTimeoutRef.current) {
          clearTimeout(saveFallbackTimeoutRef.current);
          saveFallbackTimeoutRef.current = null;
        }
        setMessages((prev) => {
          const streamingId = streamingMessageIdRef.current;
          const targetId = streamingId ?? prev.findLast((m) => m.role === 'assistant')?.id;
          if (targetId) {
            return prev.map((m) => {
              if (m.id !== targetId) return m;
              if (!m.segments) {
                return {
                  ...m,
                  segments: [{
                    type: 'tool_call' as const,
                    toolCall: {
                      toolCallId: id,
                      toolName: 'Save',
                      status: 'completed' as const,
                      input: '',
                      output: '',
                      semantic: { artifactType: '', artifactTitle: '', viewHref: '' },
                    },
                  }],
                };
              }
              const existingIdx = m.segments.findIndex(
                (s) => s.type === 'tool_call' && s.toolCall.toolCallId === id,
              );
              if (existingIdx >= 0) return m;
              return {
                ...m,
                segments: [...m.segments, {
                  type: 'tool_call' as const,
                  toolCall: {
                    toolCallId: id,
                    toolName: 'Save',
                    status: 'completed' as const,
                    input: '',
                    output: '',
                    semantic: { artifactType: '', artifactTitle: '', viewHref: '' },
                  },
                }],
              };
            });
          }
          const newMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant' as const,
            content: '',
            createdAt: new Date(),
            segments: [{
              type: 'tool_call' as const,
              toolCall: {
                toolCallId: id,
                toolName: 'Save',
                status: 'completed' as const,
                input: '',
                output: '',
                semantic: { artifactType: '', artifactTitle: '', viewHref: '' },
              },
            }],
          };
          return [...prev, newMsg];
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
        const id = toolCallId || safeUUID();
        if (saveFallbackTimeoutRef.current) {
          clearTimeout(saveFallbackTimeoutRef.current);
          saveFallbackTimeoutRef.current = null;
        }
        setMessages((prev) => {
          const streamingId = streamingMessageIdRef.current;
          const targetId = streamingId ?? prev.findLast((m) => m.role === 'assistant')?.id;
          if (targetId) {
            return prev.map((m) => {
              if (m.id !== targetId) return m;
              if (!m.segments) {
                return {
                  ...m,
                  segments: [{
                    type: 'tool_call' as const,
                    toolCall: {
                      toolCallId: id,
                      toolName: 'Save',
                      status: 'error' as const,
                      input: '',
                      output: '',
                      errorMessage: error ?? 'Save failed',
                    },
                  }],
                };
              }
              const existingIdx = m.segments.findIndex(
                (s) => s.type === 'tool_call' && s.toolCall.toolCallId === id,
              );
              if (existingIdx >= 0) return m;
              return {
                ...m,
                segments: [...m.segments, {
                  type: 'tool_call' as const,
                  toolCall: {
                    toolCallId: id,
                    toolName: 'Save',
                    status: 'error' as const,
                    input: '',
                    output: '',
                    errorMessage: error ?? 'Save failed',
                  },
                }],
              };
            });
          }
          const newMsg: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant' as const,
            content: '',
            createdAt: new Date(),
            segments: [{
              type: 'tool_call' as const,
              toolCall: {
                toolCallId: id,
                toolName: 'Save',
                status: 'error' as const,
                input: '',
                output: '',
                errorMessage: error ?? 'Save failed',
              },
            }],
          };
          return [...prev, newMsg];
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
        if (toolCallId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (!m.segments) return m;
              let found = false;
              const newSegments = m.segments.map((s) => {
                if (s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId) {
                  found = true;
                  return {
                    ...s,
                    toolCall: {
                      ...s.toolCall,
                      status: 'error' as const,
                      errorMessage: 'GitHub credentials have expired or been revoked.',
                    },
                  };
                }
                return s;
              });
              return found ? { ...m, segments: newSegments } : m;
            }),
          );
        }
      } catch {
        // ignore parse errors
      }
      setCredentialFailed(true);
    });

    eventSource.addEventListener('ACCESS_DENIED', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        const { toolCallId, code, retryAfter } = data;
        if (toolCallId) {
          setMessages((prev) =>
            prev.map((m) => {
              if (!m.segments) return m;
              let found = false;
              const newSegments = m.segments.map((s) => {
                if (s.type === 'tool_call' && s.toolCall.toolCallId === toolCallId) {
                  found = true;
                  return {
                    ...s,
                    toolCall: {
                      ...s.toolCall,
                      status: 'error' as const,
                      errorMessage: 'Access denied.',
                      accessNotice: { code, retryAfter },
                    },
                  };
                }
                return s;
              });
              return found ? { ...m, segments: newSegments } : m;
            }),
          );
        }
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
        showSpinner={showSpinner}
        spinnerLabel={state === 'reconnecting' ? 'Reconnecting…' : undefined}
        errorMessage={errorMessage}
        showRetry={state === 'timeout' || state === 'error'}
        onRetry={handleRetry}
      />
      <div className="flex-shrink-0 border-t border-border">
        <div className="px-8 py-4 max-w-[824px] mx-auto w-full">
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
                placeholder={placeholder}
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
    </div>
  );
}
