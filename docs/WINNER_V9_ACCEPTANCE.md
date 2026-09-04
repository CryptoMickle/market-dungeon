# Market Dungeon v9 — Winner Acceptance and Rollback Plan

Status: **WB-00, WB-01, WB-03, WB-04, and WB-05 complete locally; WB-02 read/verify feasibility complete and the unapproved Shannon write path is stopped/excluded from v9; v9 is not released**

Baseline date: **4 September 2026**

This document is the release contract for the post-v8 competition sprint. A v9
candidate may add an isolated Judge entry point, Shannon Arena, independent
verification, social challenges, and measured pilot evidence. It must not
weaken the immutable v8 submission or make the existing mainnet Judge Demo
depend on a wallet, testnet, or a new write path.

## Immutable baseline

- Branch at baseline: `main`
- Commit: `17d5714f328031c319fdd59777c841e432708806`
- Tag: `hackathon-submission-2026-v8`
- Public app: <https://market-dungeon.vercel.app>
- Submission release: <https://github.com/CryptoMickle/market-dungeon/releases/tag/hackathon-submission-2026-v8>
- v9 work branch: `phase1/winner-v9`

The v8 tag must never be moved, overwritten, or retagged. The production URL
must not be switched to v9 until every applicable release gate below passes.
If a gate fails, v8 remains the submission and rollback target.

## Verified v8 baseline

The following checks passed against commit `17d5714` before the v9 branch was
created:

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm test` | 63/63 pass |
| `npm run build -- --webpack` | Pass |
| `npm run test:e2e` | 3/3 Chromium tests pass |

The three browser tests cover five-minute market rollover, direct access to
privacy/provenance disclosures, and a complete Judge Demo with independently
verified proof links.

## Current v9 work-block status

- **WB-01 — Judge-first entry: COMPLETE locally.** `/judge` is a direct,
  prerendered entry into the existing wallet-free Judge Demo. The homepage now
  makes the two-minute verified path the primary first-screen action while the
  full four-tier expedition remains available. A plain-language proof summary
  explains choice-before-draw, non-replaceable commitment, and independent
  browser verification.
- **WB-02 — Shannon feasibility: READ/BUILD/VERIFY GO; WRITE TRACK STOPPED AND EXCLUDED FROM v9.**
  SDK `0.29.0` is pinned, an active canonical BTC five-minute market passed 32
  block-pinned discovery checks, exact buy-only IOC calldata can be built with
  `autoApprove: false`, and the fail-closed verifier is exercised against a
  public third-party fill. No Market Dungeon wallet has signed an approval or
  order, no Market Dungeon fill is being claimed, and the contest candidate
  contains no Shannon wallet/write experience.
- **WB-03 — Independent proof verifier: COMPLETE locally.** `/verify` accepts
  pasted or uploaded exported proof JSON, strictly validates the artifact,
  verifies its Market Dungeon server-authenticated Ed25519 lock receipt,
  recomputes its choice commitment and deterministic combat, decodes its
  canonical settlement bindings, and re-fetches the recorded Somnia block and
  both raw contract results. It returns `PASS`, `FAIL`, or `NOT PROVABLE`; the
  proof remains browser-local and no wallet, replay start/reveal, or indexer API
  is used. The only same-origin request is a read-only GET for the published
  receipt key; recorded calls are re-fetched from Somnia RPC. The receipt is not
  claimed as an external timestamp or third-party attestation.
- **WB-04 — Privacy-safe challenge loop: COMPLETE locally.** Result sharing
  now invites the recipient directly into `/judge?challenge=1`, where a clear
  first-screen notice explains that the recipient receives a fresh,
  separately sealed replay. Created, opened, and independently verified
  challenge checkpoints use anonymous aggregate labels without player, wallet,
  market, commitment, transcript, or proof identifiers.
- **WB-05 — Clean pilot measurement v2: COMPLETE locally.** The frozen
  `/funnel/v2/...` lifecycle separates entry, accepted lock, reveal attempt,
  terminal verifier outcome, coarse duration, sharing, challenge, and dreamDEX
  intent. WebDriver and `automation=1` smoke sessions are suppressed; legacy
  data remains separate, and non-WebDriver counts are not called unique humans.
  Temporary RPC unavailability preserves the sealed completed run for retry.
- **Release state: UNRELEASED CANDIDATE ONLY.** The work branch is backed up on
  GitHub through the preceding checkpoint, but the latest local candidate,
  production, DoraHacks, a v9 tag, and the submission video have not been
  released by these work blocks.

Current implemented-code checkpoint `542cc4700097fb1fd9af03f22074c7815a7ccd3e`
passes lint, TypeScript, 80/80 unit tests, 7/7 Shannon spike tests, the optimized
production build with static `/judge` and `/verify`, and 19/19 Chromium tests.
This is not yet the frozen release commit. The browser suite includes
prerendered `/judge`, the visible pre-reveal receipt evidence row, the identifier-free
challenge entry, mobile first-screen actionability, strict start-response
validation, temporary-RPC retry preservation, the full-run DOWN path, rollover,
disclosures, a complete Judge proof flow, mobile terminal-result and verifier
coverage, verifier acceptance plus tamper rejection, and zero-RPC rejection of
tampered receipt, algorithm, ruleset, and final-HP data.

### Historical pre-freeze evidence (`c49c562`; not the final release candidate)

| Evidence | Result |
| --- | --- |
| Historical code commit | `c49c562e10fcdc4708599c1d5e5abfa6b95537b3` |
| Local static checks | lint pass; TypeScript pass; clean diff check |
| Unit and spike checks | 80/80 application tests; 7/7 read-only Shannon proof-kernel tests |
| Deterministic browser regression | 18/18 Chromium tests; the two-test mobile proof/verifier chain additionally passed 10/10 consecutive repetitions (20 tests) |
| Optimized build | pass; static `/`, `/judge`, `/verify`, and `/credits`; dynamic API routes |
| Live stability window | 4 September 2026, 17:13–17:25 UTC; 11.5 minutes |
| Live target | The exact optimized local production build of the candidate commit, using the real dreamDEX indexer/Markets SDK and public Somnia mainnet RPC |
| Live result | 20/20 consecutive clean-browser Judge runs passed with `retries: 0` |
| Live coverage per run | fresh sealed replay; `425` anti-peek; invalid-combat rejection; public Ed25519 key; signed and byte-identical start/reveal lock receipt; valid combat/reveal; server and browser Somnia proof; truthful 2/2 Judge result; and `/verify`, explorer, contract, and dreamDEX link targets |
| Historical limitation | The test checked the `/verify` link target but did not import the exported proof into the standalone verifier or require its visible `PASS`. It is therefore stability evidence, not the final proof-round-trip release gate. |

These runs are release engineering evidence, not human pilot activity. They used
the fixed `automation=1` marker and WebDriver, so the v2 analytics contract
excludes them from pilot counts.

At commit `8cdf2918079da64832495bd8080117b376ddab5a`, the live smoke was
upgraded to download the exact new proof, import the same bytes into standalone
`/verify`, and require its visible `PASS` plus receipt, market, block and
Somnia re-fetch checks. That checkpoint passed 20/20 real-upstream runs with
zero retries. Commit `542cc47` then added the visible pre-reveal receipt row, so
the 20-run gate must be repeated on the eventual frozen release commit before
it can be checked below.

## Non-negotiable boundaries

1. `/` and the mainnet Judge Demo remain wallet-free and read-only.
2. Existing mainnet settlement proof remains locked to Somnia chain `5031`.
3. Any future Shannon write functionality must live on a separate route and be
   locked to chain `50312`.
4. Any future Shannon proof format must be distinct from the mainnet format,
   explicitly versioned, and impossible to interpret as a mainnet proof.
5. No server-side wallet or transaction-signing private key, custody, session
   delegation, arbitrary calldata relay, automatic wallet signing, or mainnet
   write is permitted. The environment-derived Ed25519 key may authenticate
   only the read-only Judge lock receipt; it cannot authorize a transaction.
6. No unlimited token approval is permitted. Approval must be bounded by the
   user's explicit maximum-loss intent.
7. A mined transaction is not evidence of a trade. Only a verified fill from
   the expected pool and market may unlock gameplay.
8. No automatic resend is permitted after an ambiguous provider or network
   error.
9. New functionality stays behind a feature flag until its release gate
   passes.
10. Any regression in the mainnet Judge Demo disables the v9 candidate.

## Gate 1 — Shannon feasibility

Timebox: **maximum 10 focused hours**.

Every condition must pass before Shannon Arena implementation continues:

- [x] A pinned SDK version passes the complete v8 lint, unit, browser, and
      production-build baseline.
- [x] An active Shannon BTC Event Contract can be discovered and bound to its
      exact market, pool, collateral, and YES/NO outcome identifiers.
- [ ] A dedicated low-value test wallet can place a buy-only IOC order with an
      exact allowance and `autoApprove: false`.
- [ ] The order produces at least one real fill; a zero-fill IOC is not a pass.
- [ ] The receipt, sender, target, calldata, market binding, and fill event can
      be independently re-fetched and verified.
- [ ] A working explorer link and reproducible evidence artifact are retained.

If any item remains unverified at the end of the timebox, stop the Shannon
write track. Continue only with the isolated Judge entry point, mainnet
verifier, social challenge, clean pilot measurement, and presentation work.

**Gate decision for v9: STOP/EXCLUDE.** The unchecked write items were not
authorized or executed. Shannon Arena is therefore absent from this release;
the successful read/build/verify spike remains feasibility evidence only.

## Gate 2 — feature freeze

Feature freeze occurs no later than **48 hours before the DoraHacks deadline**.
A candidate reaches freeze only when:

- [ ] The frozen release commit passes 20 consecutive clean-browser Judge
      runs, each carrying its exact downloaded proof through standalone
      `/verify` to visible `PASS`. Earlier checkpoints passed their narrower
      gates, but are not substitutes for this final-SHA run.
- **N/A — Shannon Arena is excluded from v9:** no wallet-to-fill run is claimed
      or required for this candidate.
- [x] The mainnet application contains no wallet connection, wallet signature
      request, approval, or transaction-write call.
- **N/A — Shannon Arena is excluded from v9:** pre-signature wallet checks,
      calldata simulation, and fill-to-settlement binding do not exist in the
      candidate.
- [x] The verifier reports `PASS`, `FAIL`, or `NOT PROVABLE`, and deliberate
      tampering with a valid artifact produces `FAIL`.
- [x] Modified replay algorithm, combat ruleset, final HP, lock receipt,
      commitment, market identity, raw ABI result, and canonical block cases
      are covered by fail-closed tests.
- **N/A — Shannon Arena is excluded from v9:** wrong-chain wallet,
      changed-account, stale-book order, recycled-pool order, approval, fee,
      signature, receipt, zero-fill, and duplicate-submit cases are not release
      claims.
- [x] Mobile and clean-browser canary checks pass locally.

Any unexplained failure returns the candidate to a disabled feature flag. It
does not consume the v8 rollback path.

## Pilot evidence gate

Metrics must distinguish human activity from automation and must publish raw
counts, denominators, time windows, and methodology. Wallet addresses,
transaction hashes, market IDs, proofs, and combat transcripts must not be
sent to analytics.

Targets for a credible competition pilot:

- [ ] At least 30 human Judge starts.
- [ ] At least 70% verified Judge completion.
- [ ] Median Judge completion below two minutes.
- **N/A for v9:** Shannon wallets, fills, and trade → combat → settlement runs
      are outside the released read-only candidate and must not be inferred.
- [ ] At least ten challenges created, five opened, and three verified.
- [ ] At least 95% proof-verification success.

If the sample is smaller, report it as a usability pilot with raw counts. Do
not present it as conversion, adoption, or product-market-fit evidence.

## Presentation gate

- [ ] DoraHacks links directly to the short Judge entry point.
- [x] A first-time tester can understand the dual victory condition and start
      without scrolling within ten seconds.
- [x] The public proof summary says, in plain language, that the choice was
      locked before market selection, the committed market could not be
      replaced, and the browser independently reproduced the onchain result.
- [x] Technical call data remains inspectable without dominating the primary
      result view.
- [ ] The final video is between two and three minutes, shows one uninterrupted
      successful Judge path, the verifier, sharing, and any pilot evidence that
      is actually claimed. Shannon is excluded and must not be implied.
- [ ] Captions are synchronized and manually checked for Somnia, dreamDEX,
      CLOB, EIP-1898, BTC, and contract terminology.
- [ ] Public app, DoraHacks page, README, video, source commit, and immutable v9
      release all reference the same candidate.

## External validation margin

Before describing the candidate as a demonstrated ecosystem loop, obtain at
least one of:

- a public technical confirmation from Somnia or dreamDEX covering the
  relevant receipt or settlement interpretation; or
- two independent fresh-clone verification runs of the documented reference
  implementation.

No partner endorsement or verification claim may be published without an
explicit public source or permission.

## Release and rollback

The release owner must complete this sequence:

1. Record the exact candidate commit and full local/CI results.
2. Deploy v9 to a preview URL and run every applicable gate there.
3. Create a new immutable v9 tag and release; never reuse the v8 tag.
4. Update the production deployment only after the v9 release exists.
5. Update DoraHacks, README, demo video, and evidence links atomically.
6. Re-check every public link in a signed-out, clean browser and on mobile.
7. Keep commit `17d5714` and tag `hackathon-submission-2026-v8` available as
   the immediate rollback target.

Rollback is mandatory if the production candidate introduces a Judge Demo
regression, an unverifiable trade or settlement claim, an unsafe approval or
retry path, or an inconsistency between the public submission artifacts.
