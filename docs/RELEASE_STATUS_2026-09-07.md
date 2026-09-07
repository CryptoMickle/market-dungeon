# Release and recording status — 7 September 2026

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
