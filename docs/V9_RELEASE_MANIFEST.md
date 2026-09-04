# Market Dungeon v9 — atomic release manifest

Status: **UNRELEASED — do not publish these placeholders**

This is the single release checklist for the v9 competition candidate. The
immutable v8 release remains the public rollback target until every applicable
item below is complete.

## Frozen identity

- Final release commit: `TO_BE_SET_AFTER_THE_LAST_CONTENT_COMMIT`
- Immutable tag: `hackathon-submission-2026-v9`
- Immutable release URL:
  `https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v9`
- Rollback commit: `17d5714f328031c319fdd59777c841e432708806`
- Rollback tag: `hackathon-submission-2026-v8`
- Preview deployment: `TO_BE_RECORDED`
- Production deployment: `TO_BE_RECORDED`
- Production public receipt key ID / SHA-256 fingerprint: `TO_BE_RECORDED`
- Final live-test UTC window and result: `TO_BE_RECORDED`
- Final proof SHA-256: `TO_BE_RECORDED`
- Final video SHA-256: `TO_BE_RECORDED`
- Final YouTube URL: `TO_BE_RECORDED`

Never move or reuse a published tag. Replace the commit placeholder only after
all source and public-copy changes are committed, then make every public
surface reference that same commit and tag.

## Deployment prerequisites

- [ ] Preview has a unique, valid `JUDGE_REPLAY_SEAL_KEY` containing exactly
      64 hexadecimal characters.
- [ ] Production has its own valid 64-hex key, stored only in the deployment
      environment.
- [ ] The Production key is designated stable. Rotating or deleting it makes
      previously issued v9 receipts `NOT PROVABLE` unless the old public key is
      retained.
- [ ] Preview serves the frozen commit and
      `/api/judge-replay/public-key` returns `200`, the expected Ed25519
      algorithm, and `private, no-store` caching.
- [ ] The complete Preview Judge flow exports its own proof and the standalone
      Preview `/verify` page loads that exact local file and ends at `PASS`.
- [ ] Preview `/judge?challenge=1` is tested directly. Before Production moves
      to v9, the share control intentionally points to the canonical Production
      URL, which may still serve v8 and is not Preview evidence.

## Frozen candidate checks

- [ ] Lint passes.
- [ ] TypeScript passes.
- [ ] Unit and Shannon read-only proof-kernel suites pass.
- [ ] Optimized production build passes.
- [ ] Complete deterministic Chromium suite passes.
- [ ] Twenty consecutive real-upstream Judge runs pass with zero retries; each
      run must carry its exact exported proof through standalone `/verify` to
      `PASS`.
- [ ] A clean-browser mobile Judge and verifier pass has no horizontal
      overflow or blocked primary action.

Automation and `automation=1` runs are release-engineering evidence only. They
must stay excluded from human pilot totals.

## Freeze and immutable release

- [ ] Freeze one exact release commit after the final content changes.
- [ ] Record all applicable Preview checks against that commit.
- [ ] Create the immutable `hackathon-submission-2026-v9` tag and GitHub
      release at the frozen commit. Never move or reuse the tag.

## Production evidence and presentation

- [ ] Deploy the exact frozen commit to Production.
- [ ] Re-run the complete live Judge → exported proof → standalone verifier
      flow against Production.
- [ ] Record the final uninterrupted Production run. Its proof must be signed
      by the stable Production key; a local test-key proof is not a public
      production-verifiable artifact.
- [ ] Encode the final 2–3 minute video and confirm full-file decode, legible
      `2/2` and `PASS`, correct links, and suitable audio loudness.
- [ ] Upload the video as Unlisted first. Paste the exact final transcript into
      YouTube Auto-sync and manually verify timing and terminology.
- [ ] Check captions at normal speed and 0.75× in an approximately 705×396
      DoraHacks-style embed.

## Atomic public update

- [ ] Update README and the DoraHacks copy to the v9 release, `/judge`,
      `/verify`, and final video.
- [ ] Replace every placeholder in the YouTube description with the exact v9
      release URL and frozen commit.
- [ ] Publish the final YouTube video and update both DoraHacks video fields.
- [ ] Verify the app, repository, release, video, and DoraHacks page while
      signed out on desktop and mobile.
- [ ] Confirm that no public v9 claim includes a Shannon write, wallet action,
      published X post, current trading volume, partner endorsement, or clean
      human-pilot result that was not actually established.

## Evidence margin

Before calling the loop externally demonstrated, retain either a public
technical confirmation from Somnia/dreamDEX or two genuinely independent
fresh-clone verification runs of the frozen public release. Otherwise describe
the challenge feature as implemented and testable, not validated conversion.

If the recruited human sample misses the documented thresholds, publish raw
counts and label it usability feedback or telemetry. Never combine v1 and v2
funnels or count automation as people.

## Rollback trigger

Immediately restore the v8 deployment if Production introduces a Judge
regression, an invalid or unstable receipt key, a proof that cannot be
reproduced, a broken public link, or any inconsistency between the deployed
app, frozen source, video, and DoraHacks submission.
