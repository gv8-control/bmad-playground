/**
 * @jest-environment jsdom
 *
 * Story 3.1: Provision a Sandbox When Opening a Conversation
 * Story 3.2: Invoke BMAD Skills via Slash Command
 * Story 3.3: Converse with the Streaming Agent
 * Unit tests for ConversationPane Client Component.
 *
 * Covers: AC-1 (provisioning on mount, streaming), AC-2 (auto-growing input),
 * AC-3 (stop button), AC-5 (client-side timeout with retry),
 * AC-6 (draft persistence).
 * Story 3.2 covers: AC-1 (slash picker opens on /), AC-2 (empty skills state),
 * AC-3 (message sending via POST /turns), AC-4 (URL transition on first message).
 * Story 3.3 covers: AC-1 (streaming agent response, thinking indicator),
 * AC-3 (stop button), AC-5 (scroll-to-bottom), AC-6 (draft persistence).
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
        MockEventSource.emit('TOOL_CALL_START', { toolName: 'Bash' });
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

    it.skip('[P0] renders Tool Pill on TOOL_CALL_START with tool name', async () => {
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

    it.skip('[P0] updates tool input on TOOL_CALL_ARGS', async () => {
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

    it.skip('[P0] marks tool completed on TOOL_CALL_END', async () => {
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

    it.skip('[P0] sets tool output on TOOL_CALL_RESULT', async () => {
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

    it.skip('[P0] promotes to Semantic Pill on TOOL_CALL_PROMOTED', async () => {
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

    it.skip('[P0] renders error-state Tool Pill on failed tool result', async () => {
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

    it.skip('[P0] renders system message on RUN_ERROR (not assistant message)', async () => {
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

    it.skip('[P0] renders system message on STREAM_ERROR (not assistant message)', async () => {
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

    it.skip('[P1] multiple tool calls each render at their positions', async () => {
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
});
