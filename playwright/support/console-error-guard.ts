import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];

    page.on('pageerror', (err) => {
      errors.push(`Uncaught page error: ${err.message}`);
    });

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Skip expected errors from test API routes
        if (!text.includes('401') && !text.includes('ERR_FAILED')) {
          errors.push(`Console error: ${text}`);
        }
      }
    });

    await use(page);

    if (errors.length > 0) {
      throw new Error(
        `Console/page errors detected during test:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
  },
});
