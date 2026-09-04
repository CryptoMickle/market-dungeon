# Market Dungeon v9 — atomic release manifest

Status: **UNRELEASED — do not publish before every applicable gate passes**

This is the single release checklist for the v9 competition candidate. The
immutable v8 release remains the public rollback target until every applicable
item below is complete.

## Frozen identity

- Frozen source identity: the immutable tag below must resolve to the exact
  release commit. The commit SHA is deliberately not embedded in this tracked
  file because doing so would create a new, different commit.
- Immutable tag: `hackathon-submission-2026-v9`
- Immutable release URL:
  `https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v9`
- Rollback commit: `17d5714f328031c319fdd59777c841e432708806`
- Rollback tag: `hackathon-submission-2026-v8`

Never move or reuse a published tag. Finish all tracked source and tracked
public-copy templates before freezing the commit. Deployment-derived evidence
and external surfaces may then reference that exact tag and release without
changing the tagged tree.

### Non-video post-release evidence

Do not commit deployment-derived metadata back into the frozen source tree.
Record the following in the GitHub release notes or in a separately attached,
checksummed post-release evidence artifact:

- the tag target's full commit SHA;
- the exact Preview and Production deployment origins;
- the Production public receipt key ID / SHA-256 fingerprint;
- the final live-test UTC window, target, repeat count, retry count, and result;
  and
- the exact exported Production proof SHA-256; and
- when video work resumes, the final video SHA-256, YouTube URL, and caption-QA
  result.

This preserves one immutable source identity while allowing evidence produced
after Preview and Production deployment to name that identity exactly.

## Latest local pre-freeze checkpoint

- Implemented-code checkpoint:
  `378129db0f76fc65d1013670de29cf7017afb6d5`
- Local checks: lint pass; TypeScript pass; 80/80 unit tests; 7/7 Shannon
  proof-kernel tests; optimized webpack production build pass.
- Deterministic Chromium checks: 20/20 pass, including complete raw RPC-result
  visibility and no terminal-action overlap at 1280×720.
- Most recent complete real-upstream proof round trip: 20/20 with zero retries
  on superseded checkpoint `9705c23aff77128603f135c0480bd9912dad81d6`,
  4 September 2026 18:34:19–18:47:06 UTC.

These results are pre-freeze evidence only. They do not check any box below for
the final release commit, Preview, Production, video, captions, or public
submission synchronization.

## Deployment prerequisites

- [ ] Vercel's system environment variables are exposed so the server-only
      `/api/build` route can report `VERCEL_GIT_COMMIT_SHA`.
- [ ] Preview has a unique, valid `JUDGE_REPLAY_SEAL_KEY` containing exactly
      64 hexadecimal characters.
- [ ] Production has its own valid 64-hex key, stored only in the deployment
      environment.
- [ ] The Production key is designated stable. Rotating or deleting it makes
      previously issued v9 receipts `NOT PROVABLE` unless the old public key is
      retained.
- [ ] Preview serves the frozen commit and
      `/api/build` reports that exact full commit SHA before the live workflow
      runs. `/api/judge-replay/public-key` returns `200`, the expected Ed25519
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
      `PASS`. Use the manual live-smoke workflow; the scheduled single run is a
      canary, not release evidence.
- [ ] A clean-browser mobile Judge and verifier pass has no horizontal
      overflow or blocked primary action.

Automation and `automation=1` runs are release-engineering evidence only. They
must stay excluded from human pilot totals.

## Freeze and immutable release

- [ ] Freeze one exact release commit after the final content changes.
- [ ] Record the functional Preview checks against that commit. Before the tag
      exists, do not count its versioned GitHub disclosure links as passing.
- [ ] Create the immutable `hackathon-submission-2026-v9` tag and GitHub
      release at the frozen commit. Never move or reuse the tag.
- [ ] Verify the tag target independently, then record its full SHA and the
      Preview evidence in the GitHub release notes or attached post-release
      evidence artifact without committing it back into the tagged tree.
- [ ] Re-check the deployed Preview's v9-tagged disclosure and integration-report
      links after the immutable tag exists, before promoting the same commit to
      Production.

## Production evidence and presentation

- [ ] Deploy the exact frozen commit to Production.
- [ ] Re-run the complete live Judge → exported proof → standalone verifier
      flow against Production.
- [ ] Append the exact Production origin, stable receipt-key fingerprint,
      live-test UTC window/result, and exported-proof SHA-256 to the same
      post-release evidence record.
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

- [ ] Confirm the tagged README and tracked DoraHacks template already need no
      source changes; never patch the tagged tree with deployment evidence.
- [ ] Update the external DoraHacks page to the v9 release, `/judge`, `/verify`,
      and final video.
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
