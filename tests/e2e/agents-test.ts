import { expect, test as base } from '@playwright/test';

export { expect };

export const test = base.extend({
  page: async ({ page, browserName, baseURL }, runTest) => {
    // WebKit upgrades loopback CSS/JS URLs under the production CSP, while this
    // optimized test server only speaks HTTP. Preserve every other directive.
    // This fixture never changes app headers or any hosted HTTPS response.
    if (browserName === 'webkit' && baseURL === 'http://127.0.0.1:3102') {
      await page.route(`${baseURL}/**`, async route => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        const headers = response.headers();
        const directives = headers['content-security-policy'].split(';').map(value => value.trim());
        expect(directives).toContain('upgrade-insecure-requests');
        headers['content-security-policy'] = directives.filter(value => value !== 'upgrade-insecure-requests').join('; ');
        await route.fulfill({ response, headers });
      });
    }
    await runTest(page);
  },
});
