import { buildTestModule } from '../helpers/test-module-builder';

/**
 * Integration tests for sandbox lifecycle via the ConversationService layer.
 * SandboxServiceFake is injected — no real Daytona API calls are made.
 *
 * Covers: B-01 (fake seam), sandbox provision/destroy contract,
 * idle timeout teardown, and zombie sandbox cleanup on provision failure.
 */
describe('Sandbox lifecycle (integration)', () => {
  // These tests will reference ConversationModule once the app is scaffolded.
  // Stub block retained so tests are structurally correct from day one.

  it.todo('provisions a sandbox when a conversation is created');
  it.todo('emits SESSION_READY after provision + clone + git-config-injection + WORKING_TREE status');
  it.todo('destroys sandbox on conversation close');
  it.todo('tears down sandbox after idle timeout (60s default) when no first message is sent');
  it.todo('cleans up partial Daytona allocation when provision() throws (no zombie sandboxes)');
  it.todo('terminates agent process via Daytona API when sandbox-agent crashes');
});

describe('SandboxServiceFake — control hooks', () => {
  it('returns a ready sandbox on provision', async () => {
    const { sandboxFake } = await buildTestModule([]);
    const sandbox = await sandboxFake.provision({ conversationId: 'conv-1' } as any);

    expect(sandbox.status).toBe('ready');
    expect(sandbox.conversationId).toBe('conv-1');
    expect(sandboxFake.activeSandboxCount()).toBe(1);
  });

  it('removes the sandbox record on destroy', async () => {
    const { sandboxFake } = await buildTestModule([]);
    const sandbox = await sandboxFake.provision({ conversationId: 'conv-2' } as any);
    await sandboxFake.destroy(sandbox.sandboxId);

    expect(sandboxFake.activeSandboxCount()).toBe(0);
  });

  it('throws on provision when failNextProvision() is called', async () => {
    const { sandboxFake } = await buildTestModule([]);
    sandboxFake.failNextProvision();

    await expect(sandboxFake.provision({ conversationId: 'conv-3' } as any)).rejects.toThrow(
      'simulated provision failure',
    );
    expect(sandboxFake.activeSandboxCount()).toBe(0);
  });
});
