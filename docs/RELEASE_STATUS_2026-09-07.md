# Release and recording status — 7 September 2026

## Consolidated reveal lookup — targeted validation passed

The combined-budget candidate `22d4895` passed all 155 local checks and GitHub
CI, but its exact-identity Preview gate stopped on the first mainnet valid
reveal: HTTP 503 after 15.273 seconds. The request log identified a dreamDEX
indexer timeout after earlier reads had consumed most of the shared deadline.
The concurrent Shannon browser case was interrupted; Production remained on
the prior release and no v12 tag was created.

A bounded follow-up measured three current mainnet metadata pipelines at 352,
288 and 217ms. No individual query was consistently slow. The supported cause
is intermittent provider latency amplified by three serialized indexer reads,
not a contract contradiction or Vercel storage failure.

Replay settlement metadata and its opening-reference ID are now requested in
one GraphQL operation. Only the dependent opening-answer lookup remains a
second indexer request. The reference ID is carried internally and is not added
to the public response. Ordinary active-market hydration keeps its previous
reference lookup. Hash-pinned RPC settlement verification, provenance checks,
the shared 15s deadline and fail-closed behavior are unchanged.

Twelve focused read/budget tests, TypeScript and lint pass locally. Full local,
Preview and Production validation have not yet been run for this candidate;
publication must not be inferred from these targeted results.

## Shared reveal-metadata budget — validation pending

The reduced-query candidate `84d90f1` passed 21 full Preview round-trips
(11 mainnet, 10 Shannon), then stopped on mainnet valid-reveal HTTP 503.
One concurrent Shannon case was interrupted and 17 did not run. The retained
request trace shows successful start, public-key lookup and the expected
425/422 boundary responses. The valid reveal failed after 10.209 seconds.
Its provider diagnostic identifies dreamDEX indexer, two attempts, 10,002ms,
no HTTP status, timeout=true. This was not a contract contradiction or a
confirmed RPC failure. Production remained on its previous release.

Replay reveal now gives the settlement metadata lookup and optional opening
reference/answer lookups one shared 15s indexer budget, with 12s per-attempt
maximum and at most two attempts per query. The deadline is passed through
each lookup and never restarted. Exhaustion remains a retryable failure;
it cannot produce a partial verified result. Non-replay indexer defaults,
RPC limits, hash-pinned proof verification and receipt/commitment rules stay
unchanged. Three new tests cover shared timing, fail-closed exhaustion and
unchanged default/RPC budgets. Forty focused tests passed. The full local
check then passed lint, TypeScript, optimized build (15 routes), 112
unit/integration, 7 Shannon kernel and 36 Chromium tests: 155 total, zero
retries. Deployed validation remains pending at this checkpoint.

## Reduced candidate discovery after measured upstream timeouts

The `8feb216` Preview gate passed three complete mainnet and three Shannon
round-trips, then stopped on mainnet valid-reveal 503: 6 passed, 1 failed,
1 interrupted, 32 not run. A separate same-seal check also returned 503.
Production remained unchanged. Candidate `e271463` adds privacy-bounded provider
failure diagnostics and passed CI (106 unit/integration + 7 kernel + 36 browser).
The same seal subsequently verified on that Preview; this did not erase the
failed gate. A later bounded diagnostic caught mainnet discovery timing out:
the dreamDEX indexer exhausted two reads and 15,002ms without an HTTP response.

Discovery now requests only five-minute candidates first. Fifteen-minute
candidates are fetched only when the returned five-minute data lacks an eligible
balanced pool. Both requests and any transport retry share the original 15s
budget; a preferred-read transport failure is not disguised as a fallback.
The same origin/provenance filters, 64-candidate per-interval bounds, randomness,
cache policy, fresh age validation, and post-load hold remain in force.

The 31 focused tests passed, including new assertions for ordered fallback,
shared deadline exhaustion and failure propagation. The full local check passed
lint, TypeScript, optimized build (15 routes), 109 unit/integration, 7 Shannon
kernel and 36 deterministic Chromium tests: 152 total, zero retries. Two local
real candidate reads each used one five-minute query: mainnet 410ms and Shannon
6,896ms. Those small observations are not a benchmark or a full live gate.
Deployed validation for this reduced-query change remains pending here.

## Replay-start latency correction — pending release validation

The two exact-identity live gates for `c1bbdfb` both stopped on Shannon start
HTTP 503, before card preparation. The candidate's isolated renderer checks
passed nine cases; they did not replace a live gate. PR #42 remained draft and
Production was not promoted.

A subsequent bounded diagnostic fetched the exact historical candidate query
directly in 9.631 seconds. Preview and unchanged Production returned a replay
in 8.317 and 8.724 seconds respectively. Individual five- and fifteen-minute
queries varied from 1.401 to 6.052 seconds, so splitting the query was not a
reliable remedy. These are a small set of observations, not a latency benchmark
or proof of the cause of every previous failure.

Only candidate discovery now permits a 12-second read with at most two attempts
inside one shared 15-second network budget. Ordinary indexer reads and all RPC
proof budgets remain unchanged. The historical filters, balanced random draw,
network isolation, cache policy and fail-closed proof checks are unchanged.
The replay's issue time and full 15-second anti-peek hold now begin after the
candidate read, and market age is rechecked at that actual issue time.

Five new tests check the scoped timeout, remaining retry budget, exhausted
budget, full post-load hold and rejection of candidates that age out during
loading. The 26 focused read/replay tests passed. Full local verification then
passed lint, TypeScript, the optimized 15-route build, 104 unit/integration,
7 Shannon kernel and 36 deterministic Chromium tests (147 total; no retries).
Deployed gates remain pending at this checkpoint; publication must not be
inferred from the local results.

## Image-readiness correction after the accepted two-step flow

The owner approved the two-step mobile flow and its GitHub/Production release.
Publication was then held by two failed live gates against `23fccd0`: the first
had a client-side timeout during valid reveal (8 passed); a separate confirmation
had Save image still disabled at its five-second assertion (36 passed).
Neither is a completed release gate. GitHub PR #42 was held in draft.

Twenty local and twenty isolated Preview sharing checks subsequently passed.
Those Preview checks used controlled market/RPC fixtures, not live chain proof.
A separate live diagnostic returned 503 at start before card preparation.
The original image stall was not reproduced with stage instrumentation; its
precise browser scheduling cause remains unconfirmed.

Fault-injection tests did reproduce two unbounded waits in the old renderer:
a non-settling image `decode()` promise and a missing `toBlob()` callback.
Both left Save image disabled beyond the unchanged five-second readiness gate.
The correction waits for loaded image data with a ten-second failure bound,
then composes the same 1200×675 canvas. PNG encoding normally stays asynchronous;
after one second without its callback, it encodes that same completed canvas
synchronously. A late callback cannot replace the result. An explicit encoder
failure or missing artwork is reported honestly, never exported as a partial card.

This addresses a known scheduling possibility: Chromium's implementation uses
[idle tasks for PNG encoding](https://chromium.googlesource.com/chromium/src/+/lkgr/third_party/blink/renderer/core/html/canvas/canvas_async_blob_creator.cc),
with its own completion deadline longer than five seconds. It is supporting
evidence for hardening the wait, not proof of the original failure's exact cause.

The added tests cover stalled decode/encode, a late callback, pixel-for-pixel
PNG fidelity, slow/broken/never-finishing artwork and failed fallback encoding.
The 15-test focused mobile run passed. The subsequent full local release check
passed lint, TypeScript, 99 unit/integration, 7 Shannon kernel and 36 Chromium
tests (142 total), plus the optimized 15-route build. No local test retries were
used. The unchanged 390px two-step panel was visually checked. Deployment outcomes
belong to the release registry, not this pre-release snapshot. No UI sequence,
proof logic, network profile, wallet behavior or video asset was changed.

**Pre-release snapshot.** Subsequent publication and completed gates are recorded
in the [release registry](https://github.com/CryptoMickle/market-dungeon/releases/latest).
Compare the release commit with the public `/api/build` identity before recording.
The v11 and pending labels below describe their checkpoint, not a rolling status.

This record resolves discrepancies between the published release, older working
documentation, and the new hybrid recording plan. It is not a deployment log for
unpublished changes. The latest two-step revision below supersedes both earlier
dialog designs. Production remains on v11.

## Two distinct versions

| Item | Published v11 | New working-tree changes |
| --- | --- | --- |
| Identity | `hackathon-submission-2026-v11` / `f30b9a56532eb6e3147e7ae8473242545635d0ef` | Earlier patches `8fac3a2` and `da58fda` deployed to Preview only; latest two-step revision under validation; no new release tag |
| Shannon Judge/verifier | Released; not merely a branch candidate | Network/proof logic unchanged |
| Mobile run card | Earlier share/export flow | Complete PNG prepared ahead of the gesture; direct Save image action, no intermediate dialog |
| X | Earlier download-and-open flow | Save image → Open X draft; manual image attachment; Challenge remains a separate text/link invitation |
| iPhone saving | A download is not a Photos save | Native image share/save where supported; long-press image or Files fallback; physical device test pending |
| Test evidence | Release gates below | Initial local checks below plus one initial Preview Shannon smoke; no new full release gate |

Published evidence:
[v11 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v11).
Recorded v11 gates: lint, TypeScript, 99 unit/integration, seven Shannon kernel,
22 deterministic Chromium, optimized build; 40/40 Preview and 40/40 Production
live rounds, 20 per network per environment, zero retries. Those live gates do
not cover the newer mobile patch or promise continuous availability.

## Initial mobile patch checks (before iPhone feedback)

- TypeScript and lint: PASS.
- Unit/integration: 99/99 PASS.
- Shannon kernel: 7/7 PASS.
- Deterministic Chromium: 25/25 PASS, including three new share regressions.
- Optimized webpack production build: PASS, 15 routes.
- 390×844 dialog screenshot inspected: complete card, readable controls, no
  horizontal overflow.
- The tests use controlled API/RPC responses and native-sharing mocks. They
  prove component behavior and valid PNG bytes, not actual iOS/X integration.
- One initial browser-test run could not start its local server due to sandbox
  `EPERM`; the permitted run then passed. No application failure is concealed.
- A parallel lint retry briefly encountered `ENOENT` while the browser runner
  recreated its temporary results folder. Lint was rerun sequentially; this
  is a tooling race, not a product or native-device test result.

New regressions cover PNG preparation before the user gesture, a file-only
native share payload with active user activation, no automatic X opening or
download, cancellation, denied clipboard access, PNG-render failure, and the
same-network Shannon challenge boundary. Existing tests cover proof export and
standalone verification for both profiles.

## First iPhone feedback revision — historical checks for `da58fda`

The developer tested Preview `8fac3a2` and reported that all three sharing
controls opened the same dialog and none directly opened X. That report was
correct; the original acceptance plan below has been corrected to three
distinct actions. Physical iPhone acceptance of the revised behavior is pending.

The same test reported missing BTC pricing on `/shannon/judge`. That route
intentionally makes no mainnet market call, but incorrectly displayed
`REFERENCE UNAVAILABLE`. It now says `HISTORICAL BTC REPLAY / OPENING PRICE SEALED`
and explains that the historical opening price remains hidden until reveal.
The empty mainnet odds component is no longer shown on Shannon. Network and
proof logic are unchanged. Mainnet's separate market reference is an active
market's opening line, not a live spot-price feed.

Regression coverage adds actual X-intent navigation to an intercepted test tab,
distinct invitation-versus-image actions, cancellation without side effects,
PNG-independent invitation sharing, and Shannon's explicit sealed-price text
with zero mainnet calls. This is automated QA, not an independent human test.

Revised local check: lint, TypeScript, 99/99 unit/integration, 7/7 Shannon
kernel, optimized build (15 routes), and 28/28 deterministic Chromium tests
all PASS. The 390×844 Save card screenshot was inspected: complete card,
readable controls and no horizontal overflow. The first check stopped on
an outdated README assertion still requiring the v10 release link; the test
now explicitly distinguishes frozen v10 submission links from README's v11
published baseline. No frozen release document was rewritten to pass the test.

## Latest UX revision — direct Save image → Open X draft

Further developer feedback found the extra Save card → Share / Save image step
misleading and the X workflow disjointed. The intermediate dialog is removed.
The result card now has two ordered actions: `1 · SAVE IMAGE` and
`2 · OPEN X DRAFT ↗`, with the text/link Challenge action separated below.

Save image invokes the prepared file-only system menu directly from the user
gesture where supported; without native file-sharing support it downloads the
PNG. Cancellation or a rejected native request never causes an automatic
download or X launch. Resolving the native promise never marks an image as saved.
Open X draft is an explicit text-only intent. The page explains manual image
attachment; it never silently launches X or claims a publication. More options
holds the manual Files fallback and optional post-text copying.

No proof, network, BTC, reveal, wallet, or video behavior changed in this revision.
Native iPhone/X/Photos acceptance remains open; automated tests use controlled
native-menu responses and an intercepted X destination, not real social posts.

Latest local validation: lint, TypeScript, 99/99 unit/integration, 7/7 Shannon
kernel, optimized production build (15 routes), 29/29 Chromium browser tests
(53.5 seconds), all PASS without retries. The result-card panel was visually
inspected at 390×844: two ordered actions, separate invitation, no extra dialog
and no horizontal overflow. This validates the UX implementation, not whether
any particular iPhone has saved the image or X has accepted an attachment.

## Continue on dreamDEX — exact meaning

- Mainnet `/judge` and full expedition results can display the action.
- It opens external `https://app.dreamdex.io/event-contracts/WBTC:USDso/5m`,
  or `15m` for the selected interval.
- It does **not** open a mainnet version of Delveworn.
- Shannon `/shannon/judge` intentionally has no such action.
- A click measures intent only, not confirmed arrival, a wallet connection,
  trade, volume or adoption.

## Video and evidence boundaries

The revised hybrid kit uses the already approved original Marin recording
(152 seconds), a new screen-recording plan, and selected existing artwork.
It does not reuse an old assembled video. Its principal run is Shannon;
a separate mainnet-to-dreamDEX insert must be clearly labeled as such.

The currently retained human ledger records one voluntary reply, zero qualified
participants, zero completed sessions, and zero independent external validators.
No fresh Discord check was performed. Automated QA and the developer's phone
report must not be counted as independent usability testing.

Working documentation was reconciled in README, PRE_VIDEO_READINESS,
JUDGE_EVIDENCE_PACK, SHANNON_JUDGE_RELEASE_CANDIDATE and DREAMDEX_INTEGRATION_REPORT.
Old release records and the old video kit are retained as historical material.
No public GitHub, DoraHacks, YouTube or Discord content was changed in this task.

## Physical-device acceptance — still open

Use an approved HTTPS Preview of the exact patch on a real iPhone. Do not post:

1. Record iPhone model, iOS, browser and X app versions.
2. Finish one real Judge run. Choose 1 · Save image directly beneath the card.
   No intermediate in-game dialog should appear. If the system menu offers
   Save Image, choose it. Otherwise use long-press or the documented Files route.
3. Confirm the saved file is a complete PNG
   with artwork, readable result, correct gold/progress and the same run ID.
4. Choose 2 · Open X draft. Check the prefilled text/link, attach the saved
   card manually, then discard the draft. It must not claim automatic attachment.
5. Exercise Save Image or long-press saving. Open Photos and verify the card.
   If those options are absent, record that limitation; do not mark Photos PASS.
6. Exercise Download PNG to Files. Check Files → Downloads; use Share → Save
   Image if available. A successful download alone does not pass Photos saving.
7. Exercise Challenge a player separately. It must offer a text/link invitation,
   not repeat the image save. Optional post-text copying is under More options.
8. Cancel the native sheet once. No X tab, download, or copied text should occur
   automatically. Repeat with a fresh run to exclude stale-card reuse.
9. Repeat on Android if available. Do not generalize an iPhone result to all mobile.

Device result: initial Preview **FAILED developer UX acceptance** as above;
revised Preview **PENDING physical iPhone acceptance**. No independent participant.

Apple documents the download location in
[Files/Downloads](https://support.apple.com/en-us/102440).
WebKit explains the transient activation requirement for sharing in
[The User Activation API](https://webkit.org/blog/13862/the-user-activation-api/).
These platform references do not establish which targets a particular user's
native share menu or installed X version will offer.

## Next release / capture gate

Obtain approval before push/deployment. Freeze a new commit/tag without moving
v11; validate Preview identity, phone behavior and both-network live gates;
deploy the same approved commit and repeat the release checks. Then capture
the final new sharing footage and record that identity in the video kit.
Human evidence remains explicitly absent unless actual qualified sessions occur.
