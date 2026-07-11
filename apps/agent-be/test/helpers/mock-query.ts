import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';

/**
 * Construct a mock `Query` that yields `messages` and exposes an `interrupt()`
 * spy. Satisfies the real `Query` interface (AsyncGenerator<SDKMessage, void> +
 * interrupt(): Promise<void>).
 *
 * The `as unknown as Query` here is legitimate test scaffolding: the object has
 * the correct runtime shape (an async generator with an interrupt method) but
 * TypeScript cannot verify the AsyncGenerator brand on `Object.assign` output.
 * This is NOT a contract assumption — the `SDKMessage` payloads themselves are
 * type-checked at their construction sites (see the fixture builders in
 * `apps/agent-be/src/streaming/agent.service.unit.spec.ts`), and that
 * type-checking is enforced by the `agent-be:typecheck` target (runs
 * `tsc --noEmit` against `tsconfig.spec.json`), which runs in CI before the
 * ts-jest test step (see `.github/workflows/test.yml`). ts-jest runs in
 * transpile-only mode (`isolatedModules: true`), so without the `typecheck`
 * gate the `SDKMessage` construction would not actually be verified.
 */
export function createMockQuery(messages: SDKMessage[]): Query {
  const interrupt = jest.fn().mockResolvedValue(undefined);
  async function* gen(): AsyncGenerator<SDKMessage, void> {
    for (const msg of messages) {
      yield msg;
    }
  }
  return Object.assign(gen(), { interrupt }) as unknown as Query;
}

/**
 * Wrap an existing async generator with an `interrupt()` spy, producing a
 * `Query`. Used by tests that need a custom generator (e.g. a stalled or
 * slow generator for circuit-breaker tests) but still want a real `Query`.
 */
export function makeQueryFromGenerator(gen: AsyncGenerator<SDKMessage, void>): Query {
  const interrupt = jest.fn().mockResolvedValue(undefined);
  return Object.assign(gen, { interrupt }) as unknown as Query;
}

/**
 * Retrieve the `interrupt()` spy from the `Query` instance that a mocked
 * `query()` factory created. Pass the `jest.fn` factory used as the SDK mock.
 *
 * Throws a descriptive error if the factory was never called or returned no
 * value — otherwise `interruptMock` would be `undefined` and the test would
 * fail later with an opaque "cannot read property 'mock' of undefined".
 *
 * The `mockQueryFactory` parameter is typed loosely (with `value?: Query`)
 * so it accepts both Jest 29's `Mock<Query>` (where `results[i].value` is
 * always `Query`) and Jest 30's `Mock<Query>` (where `results[i]` may be a
 * `MockResultIncomplete` with `value: undefined` for in-flight or thrown
 * calls). The runtime guard handles the undefined case explicitly.
 */
export function getInterruptMock(
  mockQueryFactory: { mock: { results: Array<{ value?: Query }> } },
): jest.Mock {
  const created = mockQueryFactory.mock.results[0]?.value;
  if (!created) {
    throw new Error('mockQueryFactory was never called or returned no value');
  }
  return (created as unknown as { interrupt: jest.Mock }).interrupt;
}
