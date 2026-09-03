import assert from 'node:assert/strict';
import test from 'node:test';

import nextConfig from '../next.config.ts';

test('all application and API routes receive an explicit security policy', async () => {
  assert.equal(nextConfig.poweredByHeader, false);
  const rules = await nextConfig.headers?.();
  assert.equal(rules?.length, 1);
  assert.equal(rules?.[0]?.source, '/(.*)');

  const headers = Object.fromEntries(
    (rules?.[0]?.headers ?? []).map(({ key, value }) => [key.toLowerCase(), value]),
  );
  const csp = headers['content-security-policy'];

  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/api\.infra\.mainnet\.somnia\.network/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.doesNotMatch(csp, /connect-src[^;]* \*/);
  assert.doesNotMatch(csp, /va\.vercel-scripts\.com/);
  assert.doesNotMatch(csp, /'unsafe-eval'/);
  assert.equal(headers['x-content-type-options'], 'nosniff');
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(
    headers['permissions-policy'],
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  );
  assert.equal(headers['strict-transport-security'], 'max-age=63072000; includeSubDomains');
});
