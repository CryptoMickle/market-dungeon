# Release and recording status — 7 September 2026

This record resolves discrepancies between the published release, older working
documentation, and the new hybrid recording plan. It is not a deployment log for
unpublished changes.

## Two distinct versions

| Item | Published v11 | New working-tree changes |
| --- | --- | --- |
| Identity | `hackathon-submission-2026-v11` / `f30b9a56532eb6e3147e7ae8473242545635d0ef` | Uncommitted changes on that baseline; no new tag or deployment |
| Shannon Judge/verifier | Released; not merely a branch candidate | Network/proof logic unchanged |
| Mobile run card | Earlier share/export flow | Complete PNG prepared ahead of the gesture; explicit sharing dialog; separate caption and image actions |
| X | Earlier download-and-open flow | No automatic opening or media-attachment claim; explicit text-only web intent after image handling |
| iPhone saving | A download is not a Photos save | Native image share/save where supported; long-press image or Files fallback; physical device test pending |
| Test evidence | Release gates below | Local regression checks below; no fresh Preview/Production gate |

Published evidence:
[v11 release](https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v11).
Recorded v11 gates: lint, TypeScript, 99 unit/integration, seven Shannon kernel,
22 deterministic Chromium, optimized build; 40/40 Preview and 40/40 Production
live rounds, 20 per network per environment, zero retries. Those live gates do
not cover the newer mobile patch or promise continuous availability.

## New local checks

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
2. Finish one real Judge run and open Share on X. It must keep you on the result
   until you choose an image or X action.
3. Copy the caption. Share/save the image. Confirm the file is a complete PNG
   with artwork, readable result, correct gold/progress and the same run ID.
4. If X is offered in the native menu, select it; verify the draft has the image,
   paste the caption, verify the correct challenge link, then discard the draft.
5. Exercise Save Image or long-press saving. Open Photos and verify the card.
   If those options are absent, record that limitation; do not mark Photos PASS.
6. Exercise Download PNG to Files. Check Files → Downloads; use Share → Save
   Image if available. A successful download alone does not pass Photos saving.
7. Exercise the text-only X alternative and attach the saved card manually.
   Do not claim automatic attachment by the web link.
8. Cancel the native sheet once. No X tab, download, or copied text should occur
   automatically. Repeat with a fresh run to exclude stale-card reuse.
9. Repeat on Android if available. Do not generalize an iPhone result to all mobile.

Device result: **NOT YET TESTED**.

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
