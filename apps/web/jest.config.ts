import type { Config } from 'jest';

const config: Config = {
  displayName: 'web',
  preset: '../../jest.preset.js',
  testEnvironment: 'jest-environment-jsdom',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'mts', 'mjs', 'cts', 'cjs', 'html'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json', diagnostics: false }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@bmad-easy/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@bmad-easy/database-schemas$': '<rootDir>/../../libs/database-schemas/src/index.ts',
    // Suppress next/font/google - it requires network in test env
    '^next/font/google$': '<rootDir>/src/__mocks__/next-font.ts',
  },
};

export default config;
