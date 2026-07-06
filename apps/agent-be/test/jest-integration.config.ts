import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/*.integration.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!jose|@ag-ui|@anthropic-ai)',
  ],
  testEnvironment: 'node',
  // Integration tests hit a real database — run serially to avoid state conflicts.
  maxWorkers: 1,
  testTimeout: 30_000,
  moduleNameMapper: {
    '^@bmad-easy/shared-types(.*)$': '<rootDir>/../../../libs/shared-types/src$1',
    '^@bmad-easy/database-schemas(.*)$': '<rootDir>/../../../libs/database-schemas/src$1',
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/../src/__mocks__/claude-agent-sdk.ts',
  },
};

export default config;
