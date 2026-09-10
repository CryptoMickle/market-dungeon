// Server hints are untrusted input: a malformed hint must not strand the demo.
export function replayRetrySeconds(bodyValue: unknown, headerValue: string | null, now = Date.now()): number {
  function seconds(value: unknown): number | null {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !value.trim()) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const body = seconds(bodyValue);
  const header = seconds(headerValue)
    ?? (headerValue && !Number.isNaN(Number(headerValue)) ? null : headerValue ? seconds((Date.parse(headerValue) - now) / 1_000) : null);
  return Math.min(300, Math.max(1, Math.ceil(Math.max(body ?? 0, header ?? 0) || 3)));
}

export function replayCountdownSeconds(deadline: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}
