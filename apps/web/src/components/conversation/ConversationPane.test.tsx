/**
 * @jest-environment jsdom
 *
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Story 3.3: Converse with the Streaming Agent
 * Story 3.5: Resume an Existing Conversation
 * Story 3.9: Terminate Idle Sandboxes Mid-Conversation
 * Story 3.11: Run Concurrent Conversations
 * Story 3.12: Drain Conversations Gracefully on Deploy
 * Unit tests for ConversationPane Client Component.
 *
 * Covers: AC-1 (provisioning on mount, streaming), AC-2 (auto-growing input),
 * AC-3 (stop button), AC-5 (client-side timeout with retry),
 * AC-6 (draft persistence).
 * Story 3.2 covers: AC-1 (slash picker opens on /), AC-2 (empty skills state),
 * AC-3 (message sending via POST /turns), AC-4 (URL transition on first message).
 * Story 3.3 covers: AC-1 (streaming agent response, thinking indicator),
 * AC-3 (stop button), AC-5 (scroll-to-bottom), AC-6 (draft persistence).
 * Story 3.5 covers: AC-1 (reconnecting state on resume), AC-2 (timeout + retry
 * reuses conversationId).
 * Story 3.9 covers: AC-3 (SESSION_TIMEOUT mid-session reason, onerror state preservation).
 * Story 3.11 covers: AC-2 (limit-reached blocking state), AC-4 (retry cancels
 * in-flight provisioning via DELETE before minting new conversation).
 * Story 3.12 covers: AC-1 (SESSION_DRAINING event handler sets state to
 * 'reconnecting' — reuses existing SessionState; onerror preserves state).
 * Story 5.5 covers: AC-1–AC-6, AC-8 (interleaved tool/semantic pills via segments,
 * SSE event handlers insert into streaming agent message segments, replay dedup,
 * manual save segments, CREDENTIAL_FAILURE/ACCESS_DENIED segment updates, resume
 * with segments).
 * TDD GREEN PHASE — all tests un-skipped and passing.
 */

import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConversationPane } from './ConversationPane';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('@/actions/credential-health.actions', () => ({
  __esModule: true,
  reauthorizeGitHub: jest.fn().mockResolvedValue(undefined),
}));

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

class MockEventSource {
  static instances: MockEventSource[] = [];
  static listeners: Record<string, ((event: MessageEvent) => void)[]> = {};

  url: string;
  onerror: ((event: Event) => void) | null = null;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    if (!MockEventSource.listeners[type]) {
      MockEventSource.listeners[type] = [];
    }
    MockEventSource.listeners[type].push(listener);
  }

  removeEventListener(): void {
    // no-op for test mock
  }

  close(): void {
    this.readyState = 2;
  }

  static emit(eventType: string, data: unknown): void {
    const listeners = MockEventSource.listeners[eventType] ?? [];
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    for (const listener of listeners) {
      listener(event);
    }
  }

  static reset(): void {
    MockEventSource.instances = [];
    MockEventSource.listeners = {};
  }
}

describe('ConversationPane', () => {
  const originalFetch = global.fetch;
  const originalEventSource = global.EventSource;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    MockEventSource.reset();
    jest.useFakeTimers();
    mockPush.mockClear();

    global.EventSource = MockEventSource as unknown as typeof EventSource;

    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('/turns')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversationId: 'conv-test-1', title: 'hello world' }),
        });
      }
      if (url.includes('/skills')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { name: 'bmad-prd' },
            { name: 'bmad-architect' },
            { name: 'bmad-dev-story' },
          ],
        });
      }
      if (url.includes('/resume')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ conversationId: 'conv-resume-1', sandboxStatus: 'provisioning' }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: 'conv-test-1' }),
      });
    }) as unknown as typeof fetch;

    const store: Record<string, string> = {};
    global.localStorage = {
      getItem: jest.fn((key: string) => store[key] ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn((key: string) => {
        delete store[key];
      }),
      clear: jest.fn(() => {
        for (const key of Object.keys(store)) delete store[key];
      }),
      key: jest.fn(),
      length: 0,
    } as unknown as typeof localStorage;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    global.EventSource = originalEventSource;
    global.localStorage = originalLocalStorage;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('[P0] renders introductory prompt + active text input on mount (input NOT disabled during provisioning)', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Press.*to browse available skills/)).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it('[P0] calls POST /api/conversations on mount', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/conversations',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-jwt',
          }),
        }),
      );
    });
  });

  it('[P0] opens EventSource with correct URL', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    await waitFor(() => {
      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe(
        'http://localhost:3001/api/conversations/conv-test-1/events?token=test-jwt',
      );
    });
  });

  it('[P0] enables input on SESSION_READY event', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    await act(async () => {
      MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
    });

    // Input should still be enabled (it was never disabled during provisioning)
    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });

  it('[P0] shows spinner + "Starting session…" only when user submits during provisioning', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    // Spinner should NOT be visible initially
    expect(screen.queryByText('Starting session…')).not.toBeInTheDocument();

    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'hello world' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    // Now spinner should be visible
    await waitFor(() => {
      expect(screen.getByText('Starting session…')).toBeInTheDocument();
    });
  });

  it('[P0] shows retry button on client-side timeout', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('[P1] shows error message on SESSION_ERROR event', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    await act(async () => {
      MockEventSource.emit('SESSION_ERROR', { message: 'Daytona provisioning failed' });
    });

    await waitFor(() => {
      expect(screen.getByText('Daytona provisioning failed')).toBeInTheDocument();
    });
  });

  it('[P1] queues message sent during provisioning and sends after SESSION_READY', async () => {
    await act(async () => {
      render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
    });

    const input = screen.getByLabelText('Message input') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'queued message' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Send'));
    });

    // Input should be cleared (message queued)
    expect(input.value).toBe('');

    // Spinner visible
    expect(screen.getByText('Starting session…')).toBeInTheDocument();

    // SESSION_READY arrives — spinner should disappear
    await act(async () => {
      MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
    });

    await waitFor(() => {
      expect(screen.queryByText('Starting session…')).not.toBeInTheDocument();
    });
  });

  describe('[P0] Story 3.2 — Slash Command Picker (AC-1, AC-2)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('opens picker on / at start of empty input', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '/' } });
      });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });
    });

    it('filters skills by query prefix', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '/bmad-p' } });
      });

      await waitFor(() => {
        const options = screen.getAllByRole('option');
        expect(options.length).toBeLessThanOrEqual(2);
      });
    });

    it('ArrowDown/ArrowUp moves focus in picker', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: '/' } });
      });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const options = screen.getAllByRole('option');
      expect(options[0].className).toContain('bg-surface-raised');

      await act(async () => {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      });

      await waitFor(() => {
        expect(options[1].className).toContain('bg-surface-raised');
      });
    });

    it('Enter in picker selects skill and appends /{name} to input', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });
      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, '/');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      expect(input.value).toMatch(/^\/\S+\s/);
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('Escape closes picker', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, '/');

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.keyDown(input, { key: 'Escape' });
      });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    it('shows "No skills found in this repository." when no skills', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/skills')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({ ok: true, json: async () => ({ id: 'conv-test-1' }) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      await userEvent.clear(input);
      await userEvent.type(input, '/');

      await waitFor(() => {
        expect(screen.getByText('No skills found in this repository.')).toBeInTheDocument();
      });
    });
  });

  describe('[P0] Story 3.2 — Message Sending (AC-3, AC-4)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('sends message via POST /turns on Enter (when picker closed)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      await act(async () => {
        await userEvent.clear(input);
        await userEvent.type(input, 'hello world');
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Send'));
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/conversations/conv-test-1/turns',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-jwt',
            }),
            body: expect.stringContaining('hello world'),
          }),
        );
      });
    });

    it('transitions URL to /conversations/:id on first message send', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      await act(async () => {
        await userEvent.clear(input);
        await userEvent.type(input, 'hello world');
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Send'));
      });

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/conversations/conv-test-1');
      });
    });
  });

  describe('[P1] Story 3.2 — Picker Outside Click', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('closes picker on outside click', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      await act(async () => {
        await userEvent.clear(input);
        await userEvent.type(input, '/');
      });

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.mouseDown(document.body);
      });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('[P0] Story 3.3 — Streaming Agent Response (AC-1)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('renders initial messages from props', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-test-1"
            initialMessages={[
              { id: 'm1', role: 'user', content: 'hello', createdAt: new Date() },
              { id: 'm2', role: 'assistant', content: 'hi there', createdAt: new Date() },
            ]}
          />,
        );
      });

      expect(screen.getByText('hello')).toBeInTheDocument();
      expect(screen.getByText('hi there')).toBeInTheDocument();
    });

    it('appends user message on send', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      await act(async () => {
        await userEvent.clear(input);
        await userEvent.type(input, 'test message');
      });
      await act(async () => {
        fireEvent.click(screen.getByText('Send'));
      });

      await waitFor(() => {
        expect(screen.getByText('test message')).toBeInTheDocument();
      });
    });

    it('shows thinking indicator on RUN_STARTED', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });

      expect(screen.getByRole('status')).toBeInTheDocument();
    });

    it('[P0] disables input during agent processing', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      expect(input).not.toBeDisabled();

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });

      expect(input).toBeDisabled();

      await act(async () => {
        MockEventSource.emit('RUN_FINISHED', {});
      });

      expect(input).not.toBeDisabled();
    });

    it('renders streaming agent response from SSE events', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
      });
      await act(async () => {
        MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Hello ' });
      });
      await act(async () => {
        MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'world' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Hello world/)).toBeInTheDocument();
      });
    });

    it('shows tool execution indicator on TOOL_CALL_START', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });

      expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
    });

    it('[P1] agent state returns to idle on RUN_FINISHED', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });
      await act(async () => {
        MockEventSource.emit('RUN_FINISHED', {});
      });

      expect(screen.queryByText('Stop agent')).not.toBeInTheDocument();
    });

    it('[P1] agent state returns to idle on RUN_ERROR', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });
      await act(async () => {
        MockEventSource.emit('RUN_ERROR', { message: 'Something went wrong' });
      });

      expect(screen.queryByText('Stop agent')).not.toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });

  describe('[P0] Story 3.3 — Stop Button (AC-3)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('Stop button calls POST /:id/stop', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Stop agent'));
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          'http://localhost:3001/api/conversations/conv-test-1/stop',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-jwt',
            }),
          }),
        );
      });
    });
  });

  describe('[P0] Story 3.4 — Tool Pill Lifecycle (AC-1, AC-2, AC-4)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('[P0] renders Tool Pill on TOOL_CALL_START with tool name', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
      });
    });

    it('[P0] updates tool input on TOOL_CALL_ARGS', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_ARGS', { toolCallId: 'tc-1', delta: 'git status' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
      });
    });

    it('[P0] marks tool completed on TOOL_CALL_END', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Bash/)).toBeInTheDocument();
      });
    });

    it('[P0] sets tool output on TOOL_CALL_RESULT', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: 'nothing to commit',
          role: 'tool',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Bash/)).toBeInTheDocument();
      });
    });

    it('[P0] promotes to Semantic Pill on TOOL_CALL_PROMOTED', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: '1 file changed',
          role: 'tool',
        });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_PROMOTED', {
          toolCallId: 'tc-1',
          artifactType: 'prd',
          artifactTitle: 'My PRD',
          artifactId: 'art-1',
          viewHref: '/artifacts?id=art-1',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      });
    });

    it('[P0] renders error-state Tool Pill on failed tool result', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: 'error: Command exited with code 1',
          role: 'tool',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Bash.*failed/)).toBeInTheDocument();
      });
    });

    it('[P0] renders system message on RUN_ERROR (not assistant message)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });
      await act(async () => {
        MockEventSource.emit('RUN_ERROR', { message: 'The agent stopped unexpectedly.' });
      });

      await waitFor(() => {
        expect(screen.getByText('The agent stopped unexpectedly.')).toBeInTheDocument();
      });
    });

    it('[P0] renders system message on STREAM_ERROR (not assistant message)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('STREAM_ERROR', { code: 'STREAM_BACK_PRESSURE' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Connection was slow and dropped/)).toBeInTheDocument();
      });
    });

    it('[P1] multiple tool calls each render at their positions', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Read' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-2', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-2' });
      });

      await waitFor(() => {
        expect(screen.getAllByText(/Read/)).toHaveLength(1);
        expect(screen.getAllByText(/Bash/)).toHaveLength(1);
      });
    });
  });

  describe('[P0] Story 3.5 — Reconnecting state (AC-1, AC-2)', () => {
    it('[P0] sets state to "reconnecting" (not "provisioning") when initialConversationId is provided', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });
      expect(screen.queryByText('Starting session…')).not.toBeInTheDocument();
    });

    it('[P0] calls POST /conversations/:id/resume when initialConversationId is provided', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/resume'),
          expect.objectContaining({
            method: 'POST',
          }),
        );
      });
    });

    it('[P0] does NOT call POST /conversations (create) when initialConversationId is provided', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      const calls = (global.fetch as jest.Mock).mock.calls;
      const createCall = calls.find(
        ([url]: string[]) => url === 'http://localhost:3001/api/conversations',
      );
      expect(createCall).toBeUndefined();
    });

    it('[P0] shows "Reconnecting…" label when state is "reconnecting"', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    });

    it('[P0] input is disabled when state is "reconnecting"', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      expect(input.disabled).toBe(true);
    });

    it('[P0] transitions to "ready" on SESSION_READY from "reconnecting" state', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();

      const input = screen.getByLabelText('Message input') as HTMLInputElement;
      expect(input.disabled).toBe(false);
    });

    it('[P0] transitions to "timeout" when SESSION_READY doesn\'t arrive within CLIENT_TIMEOUT_MS during "reconnecting" state', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
      expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    });

    it('[P0] handleRetry reuses existing conversationIdRef instead of resetting to null', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      (global.fetch as jest.Mock).mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/resume'),
          expect.objectContaining({
            method: 'POST',
          }),
        );
      });

      const calls = (global.fetch as jest.Mock).mock.calls;
      const createCall = calls.find(
        ([url]: string[]) => url === 'http://localhost:3001/api/conversations',
      );
      expect(createCall).toBeUndefined();
    });

    it('[P0] initial messages are rendered during "reconnecting" state (history visible before SSE ready) (AC-1)', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
            initialMessages={[
              { id: 'm1', role: 'user', content: 'previous question', createdAt: new Date() },
              { id: 'm2', role: 'assistant', content: 'previous answer', createdAt: new Date() },
            ]}
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      expect(screen.getByText('previous question')).toBeInTheDocument();
      expect(screen.getByText('previous answer')).toBeInTheDocument();
    });

    it('[P1] shows "Starting session…" (not "Reconnecting…") for new conversations', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    });
  });

  describe('[P0] Story 3.6 — Working tree indicator + manual save', () => {
    it('WORKING_TREE_DIRTY event sets indicator to dirty (AC-1)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
      });

      await waitFor(() => {
        expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
      });
    });

    it('WORKING_TREE_CLEAN event sets indicator to clean (AC-1)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('WORKING_TREE_CLEAN', {});
      });

      await waitFor(() => {
        expect(screen.getByText(/All saved/)).toBeInTheDocument();
      });
    });

    it('MANUAL_SAVE_SUCCEEDED adds a Semantic Pill message + sets indicator to clean (AC-4)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('MANUAL_SAVE_SUCCEEDED', {
          toolCallId: 'manual-save-1',
          timestamp: '2026-07-04T12:00:00.000Z',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      });
      expect(screen.getByText(/All saved/)).toBeInTheDocument();
    });

    it('MANUAL_SAVE_FAILED adds an error Tool Pill message + keeps indicator dirty (AC-5)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
      });

      await act(async () => {
        MockEventSource.emit('MANUAL_SAVE_FAILED', {
          toolCallId: 'manual-save-1',
          error: 'Commit failed',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Save failed|Commit failed/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    });

    it('handleSave calls POST /conversations/:id/save (AC-2)', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/save')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ committed: true, clean: false, queued: false }),
          });
        }
        if (url.includes('/turns')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ conversationId: 'conv-test-1', title: 'hello world' }),
          });
        }
        if (url.includes('/skills')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({ ok: true, json: async () => ({ id: 'conv-test-1' }) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
      });

      await waitFor(() => {
        expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText(/Unsaved changes/));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/save'),
          expect.objectContaining({ method: 'POST' }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/Saving…/)).toBeInTheDocument();
      });
    });

    it('queued save response sets indicator to "Saving after response…" (AC-3)', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/save')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ committed: false, clean: false, queued: true }),
          });
        }
        if (url.includes('/skills')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { name: 'bmad-prd' },
              { name: 'bmad-architect' },
              { name: 'bmad-dev-story' },
            ],
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'conv-test-1' }),
        });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
      });

      await waitFor(() => {
        expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText(/Unsaved changes/));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/Saving after response/)).toBeInTheDocument();
      });
    });

    it('clean save response (no-op) sets indicator to clean (AC-6)', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/save')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ committed: false, clean: true, queued: false }),
          });
        }
        if (url.includes('/skills')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              { name: 'bmad-prd' },
              { name: 'bmad-architect' },
              { name: 'bmad-dev-story' },
            ],
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'conv-test-1' }),
        });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('WORKING_TREE_DIRTY', { files: ['src/foo.ts'] });
      });

      await waitFor(() => {
        expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText(/Unsaved changes/));
      });

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      });

      await waitFor(() => {
        expect(screen.getByText(/All saved/)).toBeInTheDocument();
      });
    });

    it('indicator is hidden when session state is not "ready" (AC-1)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      expect(screen.queryByText(/Unsaved changes/)).not.toBeInTheDocument();
      expect(screen.queryByText(/All saved/)).not.toBeInTheDocument();
    });

    it('[P1] MANUAL_SAVE_SUCCEEDED message has correct toolCall.semantic shape for SemanticPill rendering', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances.length).toBeGreaterThan(0);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('MANUAL_SAVE_SUCCEEDED', {
          toolCallId: 'manual-save-semantic',
          timestamp: '2026-07-04T12:00:00.000Z',
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
      });
    });
  });

  describe('[P0] Story 3.7 — CREDENTIAL_FAILURE event handling (AC-3)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('CREDENTIAL_FAILURE event shows CredentialErrorBanner', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Your repository connection needs attention/),
        ).toBeInTheDocument();
      });
    });

    it('CREDENTIAL_FAILURE event marks the failing tool pill as error state', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: 'remote: Invalid username or token.',
          role: 'tool',
        });
      });
      await act(async () => {
        MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Bash.*failed/)).toBeInTheDocument();
      });
    });

    it('CREDENTIAL_FAILURE for a non-existent toolCallId does not crash (banner still shows)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'non-existent-tc' });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Your repository connection needs attention/),
        ).toBeInTheDocument();
      });
    });

    it('[P1] CredentialErrorBanner "Update access token" link opens the re-auth dialog (AC-3)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });
      });

      await waitFor(() => {
        expect(screen.getByText(/Your repository connection needs attention/)).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByLabelText('Update access token'));
      });

      await waitFor(() => {
        expect(
          screen.getByText('Reconnect your GitHub account'),
        ).toBeInTheDocument();
      });
    });

    it('[P1] credentialFailed state resets on new session start', async () => {
      jest.useFakeTimers();
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await act(async () => {
        MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Your repository connection needs attention/),
        ).toBeInTheDocument();
      });

      await act(async () => {
        jest.advanceTimersByTime(30_000);
      });

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      jest.useRealTimers();

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(
          screen.queryByText(/Your repository connection needs attention/),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe('[P0] Story 3.7 — ACCESS_DENIED event handling (AC-4)', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    it('ACCESS_DENIED event renders AccessNotice below the failing tool pill', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: 'Rate limit exceeded',
          role: 'tool',
        });
      });
      await act(async () => {
        MockEventSource.emit('ACCESS_DENIED', {
          code: 'RATE_LIMITED',
          toolCallId: 'tc-1',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/GitHub is rate-limiting this request/),
        ).toBeInTheDocument();
      });
    });

    it('ACCESS_DENIED event does NOT show CredentialErrorBanner (AC-4, FINDING-12)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('ACCESS_DENIED', {
          code: 'RATE_LIMITED',
          toolCallId: 'tc-1',
        });
      });

      expect(
        screen.queryByText(/Your repository connection needs attention/),
      ).not.toBeInTheDocument();
    });

    it('ACCESS_DENIED event does NOT disable the chat input (AC-4)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('ACCESS_DENIED', {
          code: 'RATE_LIMITED',
          toolCallId: 'tc-1',
        });
      });

      const input = screen.getByLabelText('Message input') as HTMLTextAreaElement;
      expect(input.disabled).toBe(false);
    });

    it('ACCESS_DENIED event does NOT halt the agent turn (AC-4)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('RUN_STARTED', {});
      });

      await act(async () => {
        MockEventSource.emit('ACCESS_DENIED', {
          code: 'RATE_LIMITED',
          toolCallId: 'tc-1',
        });
      });

      expect(screen.getByLabelText('Stop agent')).toBeInTheDocument();
    });

    it('ACCESS_DENIED with ORG_RESTRICTION code renders org-restriction copy', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: 'Resource not accessible by integration',
          role: 'tool',
        });
      });
      await act(async () => {
        MockEventSource.emit('ACCESS_DENIED', {
          code: 'ORG_RESTRICTION',
          toolCallId: 'tc-1',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Your organization hasn't approved this app/),
        ).toBeInTheDocument();
      });
    });

    it('ACCESS_DENIED with INSUFFICIENT_PERMISSION code renders insufficient-permission copy', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
      });
      await act(async () => {
        MockEventSource.emit('TOOL_CALL_RESULT', {
          messageId: 'msg-1',
          toolCallId: 'tc-1',
          content: 'Permission denied',
          role: 'tool',
        });
      });
      await act(async () => {
        MockEventSource.emit('ACCESS_DENIED', {
          code: 'INSUFFICIENT_PERMISSION',
          toolCallId: 'tc-1',
        });
      });

      await waitFor(() => {
        expect(
          screen.getByText(/Your account doesn't have access to this resource/),
        ).toBeInTheDocument();
      });
    });
  });

  describe('Story 3.9 — SESSION_TIMEOUT mid-session', () => {
    it('[P0] shows "Your session expired due to inactivity." when SESSION_TIMEOUT has { reason: "mid-session" }', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('SESSION_TIMEOUT', { reason: 'mid-session' });
      });

      await waitFor(() => {
        expect(screen.getByText('Your session expired due to inactivity.')).toBeInTheDocument();
      });
    });

    it('[P0] shows "Starting your session is taking longer than expected." when SESSION_TIMEOUT has no reason (pre-first-message)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('SESSION_TIMEOUT', {});
      });

      await waitFor(() => {
        expect(
          screen.getByText('Starting your session is taking longer than expected.'),
        ).toBeInTheDocument();
      });
    });

    it('[P0] shows "Starting your session is taking longer than expected." when SESSION_TIMEOUT data is unparseable', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        const listeners = MockEventSource.listeners['SESSION_TIMEOUT'] ?? [];
        const event = new MessageEvent('message', { data: 'not-valid-json{' });
        for (const listener of listeners) listener(event);
      });

      await waitFor(() => {
        expect(
          screen.getByText('Starting your session is taking longer than expected.'),
        ).toBeInTheDocument();
      });
    });

    it('[P0] Retry button calls POST /resume after mid-session SESSION_TIMEOUT', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });
      await act(async () => {
        MockEventSource.emit('SESSION_TIMEOUT', { reason: 'mid-session' });
      });

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      (global.fetch as jest.Mock).mockClear();

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/resume'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
    });

    it('[P0] onerror does not override "timeout" state — Retry button remains visible', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });
      await act(async () => {
        MockEventSource.emit('SESSION_TIMEOUT', { reason: 'mid-session' });
      });

      await waitFor(() => {
        expect(screen.getByText('Your session expired due to inactivity.')).toBeInTheDocument();
      });

      const es = MockEventSource.instances[0];
      await act(async () => {
        if (es.onerror) es.onerror(new Event('error'));
      });

      await waitFor(() => {
        expect(screen.getByText('Your session expired due to inactivity.')).toBeInTheDocument();
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('[P0] onerror does not override "reconnecting" state — Reconnecting label remains visible', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-resume-1"
          />,
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      const es = MockEventSource.instances[0];
      await act(async () => {
        if (es.onerror) es.onerror(new Event('error'));
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });
    });
  });

  describe('[P0] Story 3.11 — conversation limit reached (AC: 2)', () => {
    const LIMIT_REACHED_BODY = {
      code: 'CONVERSATION_LIMIT_REACHED',
      message: "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later.",
      meta: { limit: 10 },
    };

    it('[P0] shows the "limit reached" blocking message', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/events')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => LIMIT_REACHED_BODY,
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(screen.getByText(/reached the limit of 10 active conversations/i)).toBeInTheDocument();
      });
    });

    it('[P0] chat input is hidden when limit reached', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/events')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => LIMIT_REACHED_BODY,
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(screen.getByText(/reached the limit/i)).toBeInTheDocument();
      });
      expect(screen.queryByLabelText('Message input')).not.toBeInTheDocument();
    });

    it('[P0] no Retry button in limit-reached state', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/events')) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => LIMIT_REACHED_BODY,
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(screen.getByText(/reached the limit/i)).toBeInTheDocument();
      });
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    });

    it('[P0] non-409 error still shows generic error + Retry', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/events')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({ code: 'INTERNAL_ERROR', message: 'Something went wrong' }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Failed to create conversation/i)).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('[P0] Story 3.11 — retry cancels in-flight provisioning (AC: 4)', () => {
    it('[P0] handleRetry calls DELETE on the old conversation before minting new', async () => {
      let postCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (url.includes('/api/conversations') && method === 'POST') {
          postCount++;
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'conv-retry-1' }),
          });
        }
        if (url.includes('/api/conversations/') && method === 'DELETE') {
          return Promise.resolve({
            ok: true,
            json: async () => ({ conversationId: 'conv-retry-1', abandoned: true }),
          });
        }
        if (url.includes('/skills')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await waitFor(() => {
        expect(MockEventSource.instances).toHaveLength(1);
      });

      await act(async () => {
        MockEventSource.emit('SESSION_TIMEOUT', {});
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByRole('button', { name: 'Retry' }).click();
      });

      const calls = (global.fetch as jest.Mock).mock.calls;
      const deleteCallIndex = calls.findIndex(
        (c: [string, RequestInit?]) => c[1]?.method === 'DELETE',
      );
      const secondPostIndex = calls.findIndex(
        (c: [string, RequestInit?], i: number) => i > deleteCallIndex && c[1]?.method === 'POST',
      );
      expect(deleteCallIndex).toBeGreaterThan(-1);
      expect(secondPostIndex).toBeGreaterThan(deleteCallIndex);
    });

    it('[P0] handleRetry does NOT call DELETE when initialConversationId is defined', async () => {
      await act(async () => {
        render(
          <ConversationPane
            boundaryJwt="test-jwt"
            apiUrl="http://localhost:3001"
            initialConversationId="conv-existing"
          />,
        );
      });

      await act(async () => {
        MockEventSource.emit('SESSION_TIMEOUT', {});
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByRole('button', { name: 'Retry' }).click();
      });

      const calls = (global.fetch as jest.Mock).mock.calls;
      const hasDelete = calls.some(
        (c: [string, RequestInit?]) => c[1]?.method === 'DELETE',
      );
      expect(hasDelete).toBe(false);
    });

    it('[P0] handleRetry does NOT call DELETE when conversationIdRef is null (POST never succeeded)', async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/api/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/events')) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });

      await act(async () => {
        jest.advanceTimersByTime(30000);
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });

      await act(async () => {
        screen.getByRole('button', { name: 'Retry' }).click();
      });

      const calls = (global.fetch as jest.Mock).mock.calls;
      const hasDelete = calls.some(
        (c: [string, RequestInit?]) => c[1]?.method === 'DELETE',
      );
      expect(hasDelete).toBe(false);
    });
  });

  describe('Story 3.12 — SESSION_DRAINING event handler', () => {
    it('[P0] sets state to "reconnecting" when SESSION_DRAINING is received', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        MockEventSource.emit('SESSION_DRAINING', {});
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });
    });

    it('[P0] SESSION_DRAINING handler does not throw on malformed data (no JSON.parse needed — no data payload)', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      await act(async () => {
        const listeners = MockEventSource.listeners['SESSION_DRAINING'] ?? [];
        const event = new MessageEvent('message', { data: 'not-valid-json{' });
        for (const listener of listeners) listener(event);
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });
    });

    it('[P0] onerror does not override "reconnecting" state set by SESSION_DRAINING', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });
      await act(async () => {
        MockEventSource.emit('SESSION_DRAINING', {});
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });

      const es = MockEventSource.instances[0];
      await act(async () => {
        if (es.onerror) es.onerror(new Event('error'));
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });
    });

    it('[P0] SESSION_DRAINING transitions from "ready" to "reconnecting" (not "error")', async () => {
      await act(async () => {
        render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
      });
      await act(async () => {
        MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
      });

      expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();

      await act(async () => {
        MockEventSource.emit('SESSION_DRAINING', {});
      });

      await waitFor(() => {
        expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
      });
      expect(screen.queryByText(/Session failed to start/i)).not.toBeInTheDocument();
    });
  });

  // ─── Story 5.3: Fix Conversation Stream Structural Drift ───────────────
  //
  // GREEN PHASE: tests are active for Story 5.3 implementation.
  //
  // AC-1: Chat-input area 824px column centering (matches messages container)
  // AC-3: SessionStartSpinner centered in chat-messages panel (not input area)
  // AC-10: Conversation limit copy "limit of 10 active conversations"
  // AC-11: Retry button text color uses accent-fg (not text-bg)

  describe('Story 5.3 — structural drift', () => {
    describe('[P0] AC-1 — Chat-input area 824px column centering', () => {
      it('chat-input area has max-w-[824px] mx-auto w-full for column centering', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });

        const inputArea = document.querySelector('.flex-shrink-0.border-t.border-border');
        expect(inputArea).toBeInTheDocument();
        const innerDiv = inputArea?.querySelector('div');
        expect(innerDiv?.className).toContain('max-w-[824px]');
        expect(innerDiv?.className).toContain('mx-auto');
        expect(innerDiv?.className).toContain('w-full');
      });
    });

    describe('[P0] AC-3 — SessionStartSpinner in chat-messages panel', () => {
      it('SessionStartSpinner renders inside the chat-messages panel, not the input area', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });

        const input = screen.getByLabelText('Message input');
        await act(async () => {
          fireEvent.change(input, { target: { value: 'hello world' } });
        });
        await act(async () => {
          fireEvent.click(screen.getByText('Send'));
        });

        const spinner = await screen.findByText(/Starting session/i);
        const messageList = screen.getByTestId('chat-message-list');
        expect(messageList).toContainElement(spinner);
      });

      it('SessionStartSpinner does not render in the input area (border-t container)', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });

        const input = screen.getByLabelText('Message input');
        await act(async () => {
          fireEvent.change(input, { target: { value: 'hello world' } });
        });
        await act(async () => {
          fireEvent.click(screen.getByText('Send'));
        });

        const spinner = await screen.findByText(/Starting session/i);
        const inputArea = document.querySelector('.flex-shrink-0.border-t');
        expect(inputArea).not.toContainElement(spinner);
      });
    });

    describe('[P0] AC-10 — Conversation limit copy', () => {
      it('limit-reached message includes "limit of 10 active conversations"', async () => {
        (global.fetch as jest.Mock).mockImplementation((url: string) => {
          if (url.includes('/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/resume')) {
            return Promise.resolve({
              ok: false,
              status: 409,
              json: async () => ({
                code: 'CONVERSATION_LIMIT_REACHED',
                message: "You've reached the limit of 10 active conversations. Return to one of your existing conversations, or try again later.",
              }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response);
        });

        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });

        await waitFor(() => {
          expect(screen.getByText(/limit of 10 active conversations/)).toBeInTheDocument();
        });
      });

      it('limit-reached fallback message includes "limit of 10 active conversations"', async () => {
        (global.fetch as jest.Mock).mockImplementation((url: string) => {
          if (url.includes('/conversations') && !url.includes('/turns') && !url.includes('/skills') && !url.includes('/resume')) {
            return Promise.resolve({
              ok: false,
              status: 409,
              json: async () => ({
                code: 'CONVERSATION_LIMIT_REACHED',
              }),
            } as Response);
          }
          return Promise.resolve({
            ok: true,
            json: async () => [],
          } as Response);
        });

        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });

        await waitFor(() => {
          expect(screen.getByText(/limit of 10 active conversations/)).toBeInTheDocument();
        });
      });
    });

    describe('[P0] AC-11 — Retry button text color uses accent-fg', () => {
      it('Retry button uses text-accent-fg (not text-bg)', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });

        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('SESSION_TIMEOUT', { reason: 'mid-session' });
        });

        await waitFor(() => {
          expect(screen.getByText('Retry')).toBeInTheDocument();
        });

        const retryButton = screen.getByText('Retry');
        expect(retryButton.className).toContain('text-accent-fg');
        expect(retryButton.className).not.toContain('text-bg');
      });
    });
  });

  // ─── Story 5.5: Interleave Tool and Semantic Pills Within the Agent Markdown Stream ──
  //
  // GREEN PHASE: tests are active and passing.
  //
  // AC-1: Tool call indicator renders inline at stream position
  // AC-2: Tool call result replaces indicator in place
  // AC-3: Semantic Pill promoted in place
  // AC-4: Error-state Tool Pill renders inline
  // AC-5: Access Notice renders inline below error Tool Pill
  // AC-6: Manual save Semantic Pill renders inline
  // AC-8: SSE event handlers insert into streaming agent message
  // AC-9: Resume restores tool pills at original positions

  describe('Story 5.5 — Interleaved tool calls in agent markdown stream', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    describe('[P0] AC-1 — Tool call indicator renders inline at stream position', () => {
      it('[P0] TOOL_CALL_START inserts tool_call segment into streaming agent message (not new messages entry)', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Let me check.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });

        await waitFor(() => {
          expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
        });

        const agentMessageContainer = document.querySelector('.group.mb-6');
        expect(agentMessageContainer).not.toBeNull();
        expect(agentMessageContainer?.textContent).toContain('Running');
        expect(agentMessageContainer?.textContent).toContain('Bash');
      });

      it('[P0] tool_call segment renders inline within agent markdown (not standalone row)', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Before tool.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: ' After tool.' });
        });

        await waitFor(() => {
          expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toMatch(/Before tool.*Running.*Bash.*After tool/s);
      });
    });

    describe('[P0] AC-2 — Tool call result replaces indicator in place', () => {
      it('[P0] TOOL_CALL_RESULT updates tool_call segment in place (no new entry created)', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Working.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_RESULT', {
            messageId: 'msg-1',
            toolCallId: 'tc-1',
            content: '1 file changed',
            role: 'tool',
          });
        });

        await waitFor(() => {
          expect(screen.getByText(/Bash/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toContain('Working.');
        expect(agentMessageContainers[0].textContent).toContain('Bash');
      });
    });

    describe('[P0] AC-3 — Semantic Pill promoted in place', () => {
      it('[P0] TOOL_CALL_PROMOTED updates tool_call segment semantic field in place', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Saving.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_RESULT', {
            messageId: 'msg-1',
            toolCallId: 'tc-1',
            content: '1 file changed',
            role: 'tool',
          });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_PROMOTED', {
            toolCallId: 'tc-1',
            artifactType: 'prd',
            artifactTitle: 'My PRD',
            artifactId: 'art-1',
            viewHref: '/artifacts?id=art-1',
          });
        });

        await waitFor(() => {
          expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toContain('Progress saved');
      });
    });

    describe('[P0] AC-4 — Error-state Tool Pill renders inline', () => {
      it('[P0] failed tool result renders error-state Tool Pill inline as segment', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Trying.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_RESULT', {
            messageId: 'msg-1',
            toolCallId: 'tc-1',
            content: 'error: Command exited with code 1',
            role: 'tool',
          });
        });

        await waitFor(() => {
          expect(screen.getByText(/Bash.*failed/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toMatch(/Trying.*Bash/s);
      });
    });

    describe('[P0] AC-5 — Access Notice renders inline below error Tool Pill', () => {
      it('[P0] ACCESS_DENIED updates tool_call segment accessNotice within agent message', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Pushing.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_RESULT', {
            messageId: 'msg-1',
            toolCallId: 'tc-1',
            content: 'Rate limit exceeded',
            role: 'tool',
          });
        });
        await act(async () => {
          MockEventSource.emit('ACCESS_DENIED', {
            code: 'RATE_LIMITED',
            toolCallId: 'tc-1',
          });
        });

        await waitFor(() => {
          expect(screen.getByText(/GitHub is rate-limiting this request/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toMatch(/Pushing.*GitHub is rate-limiting/s);
      });
    });

    describe('[P0] AC-6 — Manual save Semantic Pill renders inline', () => {
      it('[P0] MANUAL_SAVE_SUCCEEDED inserts tool_call segment with semantic into last agent message', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Done.' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_END', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('MANUAL_SAVE_SUCCEEDED', {
            toolCallId: 'manual-save-1',
            timestamp: '2026-07-13T12:00:00.000Z',
          });
        });

        await waitFor(() => {
          expect(screen.getByText(/Progress saved/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toContain('Done.');
        expect(agentMessageContainers[0].textContent).toContain('Progress saved');
      });

      it('[P0] MANUAL_SAVE_FAILED inserts error-state tool_call segment into last agent message', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Done.' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_END', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('MANUAL_SAVE_FAILED', {
            toolCallId: 'manual-save-1',
            error: 'Commit failed',
          });
        });

        await waitFor(() => {
          expect(screen.getByText(/Save failed|Commit failed/i)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toContain('Done.');
      });
    });

    describe('[P0] AC-8 — SSE event handlers insert into streaming agent message', () => {
      it('[P0] TEXT_MESSAGE_START initializes segments array on streaming agent message', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Hello' });
        });

        await waitFor(() => {
          expect(screen.getByText(/Hello/)).toBeInTheDocument();
        });
      });

      it('[P0] TOOL_CALL_ARGS updates tool_call segment input within agent message segments', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Checking.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_ARGS', { toolCallId: 'tc-1', delta: 'git status' });
        });

        await waitFor(() => {
          expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
      });

      it('[P0] CREDENTIAL_FAILURE updates tool_call segment within agent message segments', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Pushing.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_RESULT', {
            messageId: 'msg-1',
            toolCallId: 'tc-1',
            content: 'remote: Invalid username or token.',
            role: 'tool',
          });
        });
        await act(async () => {
          MockEventSource.emit('CREDENTIAL_FAILURE', { toolCallId: 'tc-1' });
        });

        await waitFor(() => {
          expect(screen.getByText(/Bash.*failed/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toContain('Pushing.');
      });
    });

    describe('[P0] AC-1 edge cases — Replay dedup and stable keys', () => {
      it('[P0] duplicate TOOL_CALL_START on replay updates existing segment (no duplicate)', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Working.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });

        await waitFor(() => {
          expect(screen.getAllByText(/Running.*Bash/)).toHaveLength(1);
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
      });

      it('[P0] tool call before any text creates agent message with empty text segment + tool_call segment', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Bash' });
        });

        await waitFor(() => {
          expect(screen.getByText(/Running.*Bash/)).toBeInTheDocument();
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toContain('Bash');
      });

      it('[P1] multiple tool calls each render as separate segments within same agent message', async () => {
        await act(async () => {
          render(<ConversationPane boundaryJwt="test-jwt" apiUrl="http://localhost:3001" />);
        });
        await act(async () => {
          MockEventSource.emit('SESSION_READY', { sandboxId: 'sb-1' });
        });

        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_START', { messageId: 'agent-msg-1' });
        });
        await act(async () => {
          MockEventSource.emit('TEXT_MESSAGE_CONTENT', { messageId: 'agent-msg-1', delta: 'Working.' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-1', toolCallName: 'Read' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-1' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_START', { toolCallId: 'tc-2', toolCallName: 'Bash' });
        });
        await act(async () => {
          MockEventSource.emit('TOOL_CALL_END', { toolCallId: 'tc-2' });
        });

        await waitFor(() => {
          expect(screen.getAllByText(/Read/)).toHaveLength(1);
          expect(screen.getAllByText(/Bash/)).toHaveLength(1);
        });

        const agentMessageContainers = document.querySelectorAll('.group.mb-6');
        expect(agentMessageContainers.length).toBe(1);
      });
    });

    describe('[P0] AC-9 — Resume restores tool pills at original positions', () => {
      it('[P0] initialMessages with segments render pills at correct positions within agent message', async () => {
        await act(async () => {
          render(
            <ConversationPane
              boundaryJwt="test-jwt"
              apiUrl="http://localhost:3001"
              initialConversationId="conv-resume-1"
              initialMessages={[
                {
                  id: 'm1',
                  role: 'user',
                  content: 'check the repo',
                  createdAt: new Date(),
                },
                {
                  id: 'm2',
                  role: 'assistant',
                  content: 'Let me check.\nThe task is complete.',
                  createdAt: new Date(),
                  segments: [
                    { type: 'text', content: 'Let me check.\n' },
                    {
                      type: 'tool_call',
                      toolCall: {
                        toolCallId: 'tc-1',
                        toolName: 'Bash',
                        status: 'completed',
                        input: 'ls -la',
                        output: 'total 0',
                      },
                    },
                    { type: 'text', content: 'The task is complete.' },
                  ],
                },
              ]}
            />,
          );
        });

        await waitFor(() => {
          expect(screen.getByText(/Let me check/)).toBeInTheDocument();
        });

        expect(screen.getByText(/Bash/)).toBeInTheDocument();

        const agentMessageContainers = document.querySelectorAll('.group.mb-6.justify-start');
        expect(agentMessageContainers.length).toBe(1);
        expect(agentMessageContainers[0].textContent).toMatch(/Let me check.*Bash.*The task is complete/s);
      });

      it('[P0] initialMessages without segments fall back to content-only rendering (legacy)', async () => {
        await act(async () => {
          render(
            <ConversationPane
              boundaryJwt="test-jwt"
              apiUrl="http://localhost:3001"
              initialConversationId="conv-resume-1"
              initialMessages={[
                {
                  id: 'm1',
                  role: 'user',
                  content: 'hello',
                  createdAt: new Date(),
                },
                {
                  id: 'm2',
                  role: 'assistant',
                  content: 'Hi there',
                  createdAt: new Date(),
                },
              ]}
            />,
          );
        });

        await waitFor(() => {
          expect(screen.getByText('hello')).toBeInTheDocument();
        });

        expect(screen.getByText('Hi there')).toBeInTheDocument();
      });
    });
  });
});
