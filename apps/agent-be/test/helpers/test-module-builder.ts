import { Test, type TestingModule } from '@nestjs/testing';
import { SANDBOX_SERVICE } from '../../src/sandbox/sandbox.constants';
import { SandboxServiceFake } from './sandbox-service.fake';

type ModuleOverride = {
  provide: unknown;
  useValue?: unknown;
  useClass?: new (...args: unknown[]) => unknown;
};

/**
 * Central factory for NestJS test modules.
 *
 * Usage:
 *   const { module, sandboxFake } = await buildTestModule([ConversationModule]);
 *   const service = module.get(ConversationService);
 */
export async function buildTestModule(
  imports: unknown[],
  overrides: ModuleOverride[] = [],
): Promise<{ module: TestingModule; sandboxFake: SandboxServiceFake }> {
  const sandboxFake = new SandboxServiceFake();

  const moduleRef = await Test.createTestingModule({ imports: imports as any[] })
    .overrideProvider(SANDBOX_SERVICE)
    .useValue(sandboxFake)
    .overrideProviders(overrides)
    .compile();

  return { module: moduleRef, sandboxFake };
}

declare module '@nestjs/testing' {
  interface TestingModuleBuilder {
    overrideProviders(overrides: ModuleOverride[]): TestingModuleBuilder;
  }
}

// Augment TestingModuleBuilder to support array-form overrides
import { TestingModuleBuilder } from '@nestjs/testing';
Object.defineProperty(TestingModuleBuilder.prototype, 'overrideProviders', {
  value(overrides: ModuleOverride[]) {
    for (const o of overrides) {
      if (o.useValue !== undefined) this.overrideProvider(o.provide).useValue(o.useValue);
      else if (o.useClass) this.overrideProvider(o.provide).useClass(o.useClass as any);
    }
    return this;
  },
  writable: true,
});
