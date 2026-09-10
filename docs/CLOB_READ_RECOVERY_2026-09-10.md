# CLOB read recovery - 10 September 2026

Follow-up to the v15 recovery-health patch, targeted at `hackathon-submission-2026-v16`.

Owner feedback showed Full Expedition's CLOB panel with no percentages and the generic `LIVE ODDS UNAVAILABLE` message. A subsequent production API read returned genuine order-book quotes for that same market. The old response did not distinguish a successful empty book from a failed read, so the screenshot alone cannot establish which occurred.

## Change

- Mainnet SDK reads have a fresh three-second deadline that aborts the underlying request, replacing the SDK's default thirty-second wait for this optional context.
- A successful empty read and an upstream read failure have distinct metadata and visible explanations.
- Full Expedition retries empty books two seconds after each completed response, failed reads after five seconds, and quoted books after fifteen seconds. Requests remain sequential and pause in hidden tabs.
- Missing or mismatched odds are cleared. Expiry, market replacement and locking abort or ignore old requests; no quote is carried into another market.
- An actual last trade for the same market can still be shown when the book is empty or unavailable. Its fallback label explicitly identifies it as a last-trade price, not a current book quote.
- A valid market can still be locked without odds. Gameplay, prediction locking, settlement verification and proof formats are unchanged. No replacement probabilities are invented.

The one-minute Judge retains its separate polling and backoff behavior. Both live modes use the same truthful last-trade explanation.

## Validation scope

Five SDK-boundary tests cover exact-market reads, decimals/casing, empty and unrelated books, HTTP/GraphQL/abort failures, valid last-trade fallback and a successful new request after timeout. Fifteen Full Expedition browser scenarios cover empty-to-quoted recovery, read failures, short retries, identity mismatch, desktop/mobile display, locking and market rollover. Existing Live Judge scenarios check that its behavior remains intact.

These are controlled regression checks. Hosted checks and release identities are recorded with the v16 release when completed. An order book can legitimately be empty or its upstream service temporarily unavailable; this patch improves deadlines, recovery and explanation, not provider liquidity or availability.
