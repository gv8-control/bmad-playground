import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['**/*.integration.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: './tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!jose)',
  ],
  testEnvironment: 'node',
  // Integration tests hit a real database — run serially to avoid state conflicts.
  maxWorkers: 1,
  testTimeout: 30_000,
  moduleNameMapper: {
    '^@bmad-easy/shared-types(.*)$': '<rootDir>/../../../libs/shared-types/src$1',
    '^@bmad-easy/database-schemas(.*)$': '<rootDir>/../../../libs/database-schemas/src$1',
  },
};

export default config;
