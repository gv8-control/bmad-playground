/**
 * @jest-environment node
 *
 * Truth-table tests for isTestEndpointEnabled() in test-endpoint-guard.ts.
 *
 * Covers all combinations of (TEST_ENV, NODE_ENV, ALLOW_TEST_ENDPOINTS_IN_PRODUCTION)
 * to verify the guard's security contract: test endpoints are reachable only when
 * TEST_ENV is set AND (NODE_ENV is not 'production' OR the explicit production
 * bypass signal ALLOW_TEST_ENDPOINTS_IN_PRODUCTION is 'true').
 *
 * The bypass signal is never ambient on any deployment platform, so it cannot
 * accidentally open the door — it must be set deliberately on CI jobs that run
 * E2E against a production build (next start sets NODE_ENV=production).
 */

import { isTestEndpointEnabled } from './test-endpoint-guard';

const SET = 'ci';
const PROD = 'production';
const NON_PROD = 'test';
const BYPASS_TRUE = 'true';
const BYPASS_FALSE = 'false';

type Triple = [string | undefined, string, string | undefined];

interface Case {
  name: string;
  env: Triple;
  expected: boolean;
}

describe('isTestEndpointEnabled() truth table', () => {
  const prevTestEnv = process.env.TEST_ENV;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevBypass = process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION;

  afterEach(() => {
    delete process.env.TEST_ENV;
    delete process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: prevNodeEnv,
      configurable: true,
    });
  });

  afterAll(() => {
    if (prevTestEnv === undefined) delete process.env.TEST_ENV;
    else process.env.TEST_ENV = prevTestEnv;
    if (prevBypass === undefined) delete process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION;
    else process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION = prevBypass;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: prevNodeEnv,
      configurable: true,
    });
  });

  function setEnv(testEnv: string | undefined, nodeEnv: string, bypass: string | undefined): void {
    if (testEnv === undefined) delete process.env.TEST_ENV;
    else process.env.TEST_ENV = testEnv;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: nodeEnv,
      configurable: true,
    });
    if (bypass === undefined) delete process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION;
    else process.env.ALLOW_TEST_ENDPOINTS_IN_PRODUCTION = bypass;
  }

  it.each<Case>([
    // TEST_ENV set + production: bypass signal is load-bearing
    {
      name: "TEST_ENV set + production + bypass 'true' -> enabled (the bypass case, previously untested)",
      env: [SET, PROD, BYPASS_TRUE],
      expected: true,
    },
    {
      name: 'TEST_ENV set + production + bypass unset -> disabled',
      env: [SET, PROD, undefined],
      expected: false,
    },
    {
      name: "TEST_ENV set + production + bypass 'false' -> disabled",
      env: [SET, PROD, BYPASS_FALSE],
      expected: false,
    },
    // TEST_ENV set + non-production: bypass signal is irrelevant
    {
      name: "TEST_ENV set + non-production + bypass 'true' -> enabled",
      env: [SET, NON_PROD, BYPASS_TRUE],
      expected: true,
    },
    {
      name: 'TEST_ENV set + non-production + bypass unset -> enabled',
      env: [SET, NON_PROD, undefined],
      expected: true,
    },
    {
      name: "TEST_ENV set + non-production + bypass 'false' -> enabled",
      env: [SET, NON_PROD, BYPASS_FALSE],
      expected: true,
    },
    // TEST_ENV unset: bypass alone must not open the door
    {
      name: 'TEST_ENV unset + production + bypass true -> disabled (bypass alone does not open the door)',
      env: [undefined, PROD, BYPASS_TRUE],
      expected: false,
    },
    {
      name: 'TEST_ENV unset + production + bypass unset -> disabled',
      env: [undefined, PROD, undefined],
      expected: false,
    },
    {
      name: 'TEST_ENV unset + non-production + bypass true -> disabled',
      env: [undefined, NON_PROD, BYPASS_TRUE],
      expected: false,
    },
    {
      name: 'TEST_ENV unset + non-production + bypass unset -> disabled',
      env: [undefined, NON_PROD, undefined],
      expected: false,
    },
  ])('$name', ({ env, expected }) => {
    setEnv(env[0], env[1], env[2]);
    expect(isTestEndpointEnabled()).toBe(expected);
  });
});
