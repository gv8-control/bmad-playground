import { type Page, type APIRequestContext } from '@playwright/test'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000'

/**
 * Shared streaming-mock helpers for conversation E2E tests.
 *
 * Extracts the duplicated MockEventSource class, FetchCall/MockHandle
 * interfaces, MockHandle return-object factory, readySession, and
 * sendMessage helpers that were copy-pasted across the conversation
 * spec files.
 *
 * The MockEventSource class and fetch interceptor run in the browser
 * via page.addInitScript. The createMockHandle factory and
 * readySession/sendMessage helpers run in Node.
 */

export interface FetchCall {
  url: string
  method: string
  headers: Record<string, string>
}

export interface MockHandle {
  waitForEventSource: () => Promise<void>
  emit: (type: string, data?: unknown) => Promise<void>
  fetchCalls: () => Promise<FetchCall[]>
  waitForFetchCount: (count: number) => Promise<void>
}

/**
 * Serializable route specification for custom fetch interceptors.
 * Custom routes are checked BEFORE the default routes.
 */
export interface RouteSpec {
  urlIncludes: string
  method: string
  status: number
  /** Static response body (JSON-serialized). */
  body?: unknown
  /**
   * If set, the response body is read from window[bodyWindowVar] at
   * request time (enables dynamic responses). Mutually exclusive with
   * `body` — if both are set, `bodyWindowVar` takes precedence.
   */
  bodyWindowVar?: string
}

export interface SetupStreamingMocksOptions {
  conversationId?: string
  turnTitle?: string
  skills?: Array<{ name: string }>
  /** Custom routes checked before default routes. */
  routes?: RouteSpec[]
  /** Include default routes (/stop, /turns, /skills, /api/conversations). Default: true. */
  defaultRoutes?: boolean
  /** Window variables to initialize (e.g. { __saveResponse: {...} }). */
  windowVars?: Record<string, unknown>
}

/**
 * Factory for the core MockHandle return object.
 * Eliminates the duplicated waitForEventSource/emit/fetchCalls/waitForFetchCount
 * boilerplate across spec files.
 */
export function createMockHandle(page: Page): MockHandle {
  return {
    waitForEventSource: () =>
      page
        .waitForFunction(
          () => (window as unknown as Record<string, unknown>).__mockEventSource != null,
          undefined,
          { timeout: 30_000 },
        )
        .then(() => undefined),
    emit: (type: string, data: unknown = {}) =>
      page.evaluate(
        ({ type, data }) => {
          const es = (window as unknown as Record<string, unknown>).__mockEventSource as
            | { __emit: (type: string, data: unknown) => void }
            | undefined
          es?.__emit(type, data)
        },
        { type, data },
      ),
    fetchCalls: () =>
      page.evaluate(() => {
        const calls = (window as unknown as Record<string, unknown>).__mockFetchCalls as FetchCall[]
        return calls ?? []
      }),
    waitForFetchCount: (count: number) =>
      page
        .waitForFunction(
          (n) =>
            ((window as unknown as Record<string, unknown>).__mockFetchCalls as FetchCall[] | undefined)?.length ?? 0 >= n,
          count,
          { timeout: 30_000 },
        )
        .then(() => undefined),
  }
}

/**
 * Installs MockEventSource + a mocked fetch interceptor via page.addInitScript.
 *
 * Default routes (when defaultRoutes is true):
 *   POST /stop           → 200 { conversationId, stopped: true }
 *   POST /turns          → 201 { conversationId, title: turnTitle }
 *   GET  /skills         → 200 skills (or [{ name: 'bmad-prd' }])
 *   POST /api/conversations → 201 { id: conversationId }
 *
 * Custom routes (via `routes` option) are checked BEFORE defaults.
 * The `__mockFetchInstalled` guard prevents double-installation.
 */
export async function setupStreamingMocks(
  page: Page,
  options: SetupStreamingMocksOptions = {},
): Promise<MockHandle> {
  const {
    conversationId = 'conv-e2e',
    turnTitle = 'Test Turn',
    skills,
    routes = [],
    defaultRoutes = true,
    windowVars,
  } = options

  await page.addInitScript(
    ({ conversationId, turnTitle, skills, customRoutes, useDefaultRoutes, windowVars }) => {
      class MockEventSource {
        url: string
        readyState = 0
        onerror: ((event: Event) => void) | null = null
        private readonly listeners: Record<string, Array<(event: { data: string }) => void>> = {}

        constructor(url: string) {
          this.url = url
          ;(window as unknown as Record<string, unknown>).__mockEventSource = this
        }

        addEventListener(type: string, handler: (event: { data: string }) => void): void {
          ;(this.listeners[type] = this.listeners[type] || []).push(handler)
        }

        removeEventListener(): void {
          // no-op for test mock
        }

        close(): void {
          this.readyState = 2
        }

        __emit(type: string, data: unknown): void {
          const event = { data: typeof data === 'string' ? data : JSON.stringify(data) }
          ;(this.listeners[type] || []).forEach((handler) => handler(event))
        }
      }

      ;(window as unknown as Record<string, unknown>).EventSource = MockEventSource

      const w = window as unknown as Record<string, unknown>
      if (!w.__mockFetchInstalled) {
        w.__mockFetchInstalled = true
        const originalFetch = window.fetch.bind(window)
        w.__mockFetchCalls = [] as FetchCall[]

        // Initialize custom window variables
        if (windowVars) {
          for (const k of Object.keys(windowVars)) w[k] = windowVars[k]
        }

        w.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString()
          const method = init?.method ?? 'GET'
          const rawHeaders = (init?.headers as Record<string, string>) ?? {}
          const headers: Record<string, string> = {}
          for (const k of Object.keys(rawHeaders)) headers[k.toLowerCase()] = rawHeaders[k]
          ;(w.__mockFetchCalls as FetchCall[]).push({ url, method, headers })

          // Custom routes (checked first)
          for (const route of customRoutes) {
            if (url.includes(route.urlIncludes) && method === route.method) {
              const body = route.bodyWindowVar ? w[route.bodyWindowVar] : route.body
              return new Response(JSON.stringify(body), {
                status: route.status,
                headers: { 'Content-Type': 'application/json' },
              })
            }
          }

          // Default routes
          if (useDefaultRoutes) {
            if (url.includes('/stop') && method === 'POST') {
              return new Response(JSON.stringify({ conversationId, stopped: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            }

            if (url.includes('/turns') && method === 'POST') {
              return new Response(JSON.stringify({ conversationId, title: turnTitle }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              })
            }

            if (url.includes('/skills') && method === 'GET') {
              return new Response(JSON.stringify(skills ?? [{ name: 'bmad-prd' }]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            }

            if (url.includes('/api/conversations') && method === 'POST') {
              return new Response(JSON.stringify({ id: conversationId }), {
                status: 201,
                headers: { 'Content-Type': 'application/json' },
              })
            }
          }

          return originalFetch(input as RequestInfo, init)
        }
      }
    },
    {
      conversationId,
      turnTitle,
      skills,
      customRoutes: routes,
      useDefaultRoutes: defaultRoutes,
      windowVars,
    },
  )

  return createMockHandle(page)
}

/**
 * Waits for the mock EventSource, emits SESSION_READY, and waits for the
 * initial fetch calls (POST /api/conversations + GET /skills = 2 by default).
 */
export async function readySession(
  mocks: MockHandle,
  options: { expectedInitFetchCount?: number } = {},
): Promise<void> {
  const { expectedInitFetchCount = 2 } = options
  await mocks.waitForEventSource()
  await mocks.emit('SESSION_READY', { sandboxId: 'sb-1' })
  await mocks.waitForFetchCount(expectedInitFetchCount)
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name: 'Message input' })
  await input.fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
}

/**
 * Combined setup for conversation E2E tests that send messages.
 *
 * Does three things:
 * 1. Seeds a Conversation row with the mock's conversationId in the DB
 *    (so the RSC page finds it and renders ConversationPane with
 *    initialConversationId — no redirect to /conversations/new).
 * 2. Installs streaming mocks (MockEventSource + fetch interceptor).
 * 3. Navigates directly to /conversations/{conversationId} and waits for
 *    the session to be ready.
 *
 * By navigating to the existing conversation (not /conversations/new),
 * ConversationPane mounts with initialConversationId set. This means:
 *   - startSession() skips POST /api/conversations (takes the resume path)
 *   - sendMessage() does NOT call router.push() (no navigation race)
 *   - The streaming component is never unmounted mid-test
 *
 * Returns `{ mocks, cleanup }` where cleanup deletes the seeded conversation.
 * Tests should call `cleanup()` in a `finally` block or rely on the fixture's
 * teardown.
 */
export async function setupReadySession(
  page: Page,
  request: APIRequestContext,
  userId: string,
  options: SetupStreamingMocksOptions = {},
): Promise<{ mocks: MockHandle; cleanup: () => Promise<void> }> {
  const conversationId = options.conversationId ?? 'conv-e2e'
  const cleanup = await seedConversation(request, userId, conversationId)
  const mocks = await setupStreamingMocks(page, options)
  await page.goto(`/conversations/${conversationId}`)
  await readySession(mocks)
  return { mocks, cleanup }
}

/**
 * Seeds a Conversation row with a custom ID in the test database.
 *
 * Tests that mock conversation creation with a hardcoded ID (e.g.
 * 'conv-e2e-tool-pills') and then send a message trigger
 * `router.push('/conversations/{id}')` in ConversationPane. The RSC
 * page queries the DB for the conversation — if it doesn't exist, the
 * page redirects to /conversations/new, unmounting the streaming
 * component and destroying all in-memory state (pills, text segments).
 *
 * Calling this before the test starts ensures the RSC page finds the
 * conversation and renders ConversationPane with initialConversationId,
 * preventing the navigation race.
 *
 * Returns a cleanup function that deletes the seeded conversation.
 */
export async function seedConversation(
  request: APIRequestContext,
  userId: string,
  conversationId: string,
  title = 'E2E Conversation',
): Promise<() => Promise<void>> {
  const res = await request.post(`${BASE_URL}/api/internal/test/conversations`, {
    data: { userId, conversations: [{ id: conversationId, title }] },
  })
  if (!res.ok()) {
    throw new Error(`seedConversation failed: ${res.status()} ${await res.text()}`)
  }

  return async () => {
    await request.delete(`${BASE_URL}/api/internal/test/conversations`, {
      data: { userId },
    })
  }
}
