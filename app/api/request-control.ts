type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
};

const MAX_BUCKETS = 2_048;
const buckets = new Map<string, RateLimitBucket>();

function firstForwardedValue(value: string | null) {
  return value?.split(',')[0]?.trim() ?? '';
}

function clientIdentity(request: Request) {
  const forwarded = firstForwardedValue(request.headers.get('x-vercel-forwarded-for'))
    || firstForwardedValue(request.headers.get('x-forwarded-for'))
    || firstForwardedValue(request.headers.get('cf-connecting-ip'))
    || firstForwardedValue(request.headers.get('x-real-ip'));
  return (forwarded || 'platform-anonymous').slice(0, 96);
}

function pruneBuckets(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

export function checkRateLimit(
  request: Request,
  options: { namespace: string; limit: number; windowMs: number },
  now = Date.now(),
): RateLimitResult {
  if (buckets.size >= MAX_BUCKETS) pruneBuckets(now);

  const key = `${options.namespace}:${clientIdentity(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + options.windowMs };
    buckets.set(key, bucket);
  }

  const allowed = bucket.count < options.limit;
  if (allowed) bucket.count += 1;
  const remaining = Math.max(0, options.limit - bucket.count);
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000));

  return {
    allowed,
    limit: options.limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfter,
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    'ratelimit-limit': String(result.limit),
    'ratelimit-remaining': String(result.remaining),
    'ratelimit-reset': String(Math.ceil(result.resetAt / 1_000)),
  };
}

export function resetRequestControlForTests() {
  buckets.clear();
}
