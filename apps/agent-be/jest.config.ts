import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  testMatch: ['**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@bmad-easy/shared-types(.*)$': '<rootDir>/../../libs/shared-types/src$1',
    '^@bmad-easy/database-schemas(.*)$': '<rootDir>/../../libs/database-schemas/src$1',
  },
};

export default config;
