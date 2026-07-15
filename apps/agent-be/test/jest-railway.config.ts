import type { Config } from 'jest';

// Runs ONLY the real-service specs that hit live Railway/Vercel APIs.
// These specs require RAILWAY_TOKEN and VERCEL_TOKEN (from .env.local or CI
// secrets) and will fail loud if those tokens are missing — they are excluded
// from the default test-integration target so `yarn nx run-many --target=test-integration --all`
// does not break in environments without platform API access.
//
// Run: yarn nx test-railway agent-be
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: [
    '**/railway-*.integration.spec.ts',
    '**/platform-env-vars.integration.spec.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!jose|@ag-ui|@anthropic-ai)',
  ],
  testEnvironment: 'node',
  // Real-service specs hit live Railway/Vercel APIs — run serially to avoid
  // rate limits and state conflicts.
  maxWorkers: 1,
  testTimeout: 30_000,
  moduleNameMapper: {
    '^@bmad-easy/shared-types(.*)$': '<rootDir>/../../../libs/shared-types/src$1',
    '^@bmad-easy/database-schemas(.*)$': '<rootDir>/../../../libs/database-schemas/src$1',
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/../src/__mocks__/claude-agent-sdk.ts',
  },
};

export default config;
