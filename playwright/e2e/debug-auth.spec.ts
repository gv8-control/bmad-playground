import { test, expect } from '../support/merged-fixtures';

test.describe('debug: try different formats', () => {
  test('format 1: just root with result', async ({ page }) => {
    await page.goto('http://localhost:3000/onboarding');
    await page.route('**/project-map', (route) =>
      route.fulfill({ status: 200, body: '<html><body>Project Map</body></html>' }),
    );
    await page.route('**/onboarding', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        await route.fulfill({ status: 200, contentType: 'text/x-component', body: `0:{"success":true}` });
      } else { await route.continue(); }
    });
    await page.getByLabel(/repository url/i).fill('https://github.com/test-org/test-repo');
    await page.getByRole('button', { name: /connect repository/i }).click();
    await page.waitForTimeout(3000);
    console.log('Format 1 - URL:', page.url(), '- error:', await page.locator('#repo-url-error').textContent().catch(() => 'none'));
  });

  test('format 2: just action result', async ({ page }) => {
    await page.goto('http://localhost:3000/onboarding');
    await page.route('**/project-map', (route) =>
      route.fulfill({ status: 200, body: '<html><body>Project Map</body></html>' }),
    );
    await page.route('**/onboarding', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        await route.fulfill({ status: 200, contentType: 'text/x-component', body: `1:{"success":true}` });
      } else { await route.continue(); }
    });
    await page.getByLabel(/repository url/i).fill('https://github.com/test-org/test-repo');
    await page.getByRole('button', { name: /connect repository/i }).click();
    await page.waitForTimeout(3000);
    console.log('Format 2 - URL:', page.url(), '- error:', await page.locator('#repo-url-error').textContent().catch(() => 'none'));
  });

  test('format 3: with Vercel-style format', async ({ page }) => {
    await page.goto('http://localhost:3000/onboarding');
    await page.route('**/project-map', (route) =>
      route.fulfill({ status: 200, body: '<html><body>Project Map</body></html>' }),
    );
    await page.route('**/onboarding', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        const result = JSON.stringify({ success: true });
        await route.fulfill({ status: 200, contentType: 'text/x-component', body: `0:["$","k",{"success":true}]\n1:${result}` });
      } else { await route.continue(); }
    });
    await page.getByLabel(/repository url/i).fill('https://github.com/test-org/test-repo');
    await page.getByRole('button', { name: /connect repository/i }).click();
    await page.waitForTimeout(3000);
    console.log('Format 3 - URL:', page.url(), '- error:', await page.locator('#repo-url-error').textContent().catch(() => 'none'));
  });

  test('format 4: use route.fetch to capture real response', async ({ page }) => {
    await page.goto('http://localhost:3000/onboarding');
    
    let capturedBody = '';
    await page.route('**/onboarding', async (route) => {
      if (route.request().method() === 'POST' && route.request().headers()['next-action']) {
        const response = await route.fetch();
        const body = await response.text();
        capturedBody = body;
        console.log('REAL RESPONSE BODY LENGTH:', body.length);
        console.log('REAL RESPONSE BODY:', body.substring(0, 1000));
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    
    await page.getByLabel(/repository url/i).fill('https://github.com/test-org/test-repo');
    await page.getByRole('button', { name: /connect repository/i }).click();
    await page.waitForTimeout(5000);
    console.log('Format 4 - URL:', page.url());
  });
});
