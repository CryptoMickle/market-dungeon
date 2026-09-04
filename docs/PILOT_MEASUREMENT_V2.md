# Market Dungeon — clean pilot measurement v2

Status: **measurement contract; no v2 production evidence has been collected yet**

This document defines the clean measurement window for the Market Dungeon v9
candidate. It is intentionally separate from the legacy baseline described in
the README. Legacy `/funnel/...` counts and v2 `/funnel/v2/...` counts must
never be combined.

The purpose of v2 is narrow: produce reproducible, privacy-preserving raw
counts for the pilot and presentation gates in
[`WINNER_V9_ACCEPTANCE.md`](WINNER_V9_ACCEPTANCE.md). It does not establish
unique users, trading volume, retention, adoption, or product-market fit.

## Measurement boundary

The v2 observation window begins only after all of the following are recorded:

1. the exact candidate commit and immutable release tag;
2. the production deployment containing the v2 event schema;
3. a successful clean-browser check of `/judge`;
4. the UTC timestamp at which collection starts; and
5. confirmation that scheduled browser smoke runs are excluded.

The window ends at a recorded UTC timestamp. All results must state the full
`start <= event < end` interval and the extraction timestamp. A deployment,
schema, or event-definition change starts a new window; it must not silently
continue the previous one.

Vercel Web Analytics manual pageviews are event labels only. They do not
navigate the player to the listed path.

## Canonical event schema

Every segment below is a closed enumeration. Implementations must not append
free-form text or identifiers.

| Event path | Exact emission point | Counting rule | What it means |
| --- | --- | --- | --- |
| `/funnel/v2/judge/entry/home` | The player explicitly chooses the Judge Demo from the home screen. | Once per mounted entry flow. | Judge Demo interest from the home page; not a started run. |
| `/funnel/v2/judge/entry/direct` | The direct `/judge` entry renders interactively. | Once per mounted direct-entry flow. | Direct Judge entry viewed; not a started run. |
| `/funnel/v2/judge/entry/challenge` | A structurally valid challenge entry is accepted and shown. | Once per mounted challenge-entry flow. | A valid challenge was opened in this browser session; not a unique person or run. |
| `/funnel/v2/judge/locked/{interval}` | `/api/judge-replay/start` returns success and the client validates the sealed replay before gameplay begins. | Once per newly accepted sealed replay. | The canonical Judge-start denominator. |
| `/funnel/v2/judge/reveal-attempted/{interval}` | Immediately before the first eligible reveal request for a sealed run, after required combat and the anti-peek hold. | Once per sealed run, regardless of retries. | A completed combat run reached proof verification. |
| `/funnel/v2/judge/verified/{interval}/{duration}/{result}/{direction}` | The server proof, combat replay, commitment, canonical block, raw calls, ABI values, and independent browser RPC verification all pass, immediately before the terminal result is applied. | Once per sealed run and mutually exclusive with terminal `fail` or `not-provable`. | A verified Judge completion (`PASS`). |
| `/funnel/v2/judge/verification/fail/{reason}` | Verification reaches a definitive integrity failure and the run cannot continue. | Once per sealed run and mutually exclusive with `verified` or `not-provable`. | The artifact or binding failed verification (`FAIL`). |
| `/funnel/v2/judge/verification/not-provable/{reason}` | Verification reaches a defined terminal state where validity cannot be established or rejected. | Once per sealed run and mutually exclusive with `verified` or `fail`. | The run cannot be proved (`NOT PROVABLE`). |
| `/funnel/v2/dreamdex/continue/{interval}/{mode}/{result}/{direction}` | The player activates the external Continue-on-dreamDEX link after a terminal Market Dungeon result. | Once per run. | External discovery intent only; not arrival, wallet connection, order, fill, or volume. |
| `/funnel/v2/share/engaged/{mode}` | The first supported share action for a result succeeds or an X composer is opened. | Once per run. | At least one share action was used; not proof that content was posted or viewed. |
| `/funnel/v2/share/action/{mode}/{action}` | The named share action reaches its defined success boundary. | Once per action type per run. | Channel-specific action volume. Several action types may occur in one run. |
| `/funnel/v2/challenge/created` | An independently verified Judge source run successfully invokes an action that exposes the fixed challenge link. | Once per verified source run; reopening actions does not emit again. | A challenge link was prepared; not proof it was sent or posted. |
| `/funnel/v2/challenge/opened` | The fixed `?challenge=1` entry is accepted and its challenge experience is shown. | Once per mounted challenge-entry flow. | Challenge-entry event volume; not a unique link, person, sender, or recipient. |
| `/funnel/v2/challenge/verified` | A Judge run entered through the fixed challenge marker later reaches `PASS`. | Once per challenge-entry run. | A verified run followed challenge entry; no source-to-recipient attribution is established. |

Allowed values are:

- `interval`: `5m` or `15m`;
- `duration`: `under-60s`, `60-119s`, `120-179s`, `180s-plus`, or `unknown`;
- Judge `verified` result: `blessed` or `cursed`; the Judge replay pool is
  explicitly non-void. Full-run `dreamdex/continue` results may additionally be
  `void`;
- `direction`: `up` or `down`;
- `mode`: `judge-demo` or `full-run`;
- terminal `fail` reason: `server-rejected` or `browser-mismatch`;
- terminal `not-provable` reason: `seal-expired`; and
- share `action`: `native-completed`, `x-intent-opened`, `card-downloaded`, or `text-copied`.

An X event stops at `x-intent-opened`: Market Dungeon cannot observe whether
the user posts. `native-completed` requires the native share promise to resolve.
`card-downloaded` requires the download action to be initiated successfully,
and `text-copied` requires a successful clipboard write.

## Run lifecycle and once-per-run semantics

A Judge run does **not** start on page load, on entry-button click, or when a
start request is sent. It starts only when a valid sealed replay response is
accepted. That moment emits `judge/locked` and initializes an in-memory start
time plus per-run emission flags.

The following rules are mandatory:

1. Entry events are discovery events and never enter the Judge-completion
   denominator.
2. A retry of replay creation does not emit `locked` until one response is
   accepted. A second accepted replay is a new run.
3. Reveal retries share one `reveal-attempted` event.
4. Each run emits at most one terminal classification: `verified`, `fail`, or
   `not-provable`.
5. `blessed` and `cursed` are successful Judge proof completions when
   verification passes. Winning the prediction is not required for `PASS`.
   Judge Replay excludes voided markets, while the separate full-run settlement
   path continues to support voids without exporting a `verified-judge-run/v2`
   artifact.
6. A reset clears the previous in-memory event flags. It must not retroactively
   emit an event for an abandoned run.
7. Analytics errors must never interrupt gameplay, proof verification, or
   result application.
8. Once-per-run state remains browser-local and is never sent as an identifier.

A page reload creates a new mounted entry flow. The current sealed Judge run is
not recoverable after reload, so it cannot legitimately emit a second terminal
event. Aggregate analytics still cannot prove that separate runs came from
separate people.

## Duration definition

Judge duration is monotonic elapsed time from acceptance of the sealed replay
to successful completion of independent browser verification. Page-load time,
time spent reading the entry screen, and failed replay-creation requests are
excluded. The anti-peek hold, combat, reveal request, and proof verification are
included.

Only the bucket is emitted:

| Elapsed time | Bucket |
| --- | --- |
| `0 <= t < 60,000 ms` | `under-60s` |
| `60,000 <= t < 120,000 ms` | `60-119s` |
| `120,000 <= t < 180,000 ms` | `120-179s` |
| `t >= 180,000 ms` | `180s-plus` |
| Missing, negative, non-finite, or unavailable start time | `unknown` |

An exact duration must never be placed in an analytics path. For a conservative
claim that the median is below two minutes, strictly more than half of verified
completions must be in `under-60s` plus `60-119s`. `unknown` remains in the
verified denominator and cannot be counted as below two minutes.

## Verification result taxonomy

The taxonomy follows the acceptance requirement that the verifier resolve to
`PASS`, `FAIL`, or `NOT PROVABLE`.

### PASS

Emit `judge/verified` only after all required combat, commitment, market,
canonical-block, raw-call, ABI, and browser-RPC checks pass. A normal onchain
loss or void is still `PASS` when its proof is valid.

### FAIL

- `server-rejected`: the server definitively rejects the sealed artifact,
  combat transcript, commitment, or required binding. This includes terminal
  `400`, `409`, or `422` integrity responses after an otherwise eligible reveal.
- `browser-mismatch`: the server returns a purported proof, but the browser
  cannot reproduce or match the canonical block, raw results, decoded fields,
  combat digest, commitment, or provenance.

`FAIL` means evidence positively contradicted the claimed run. It must never be
used for a temporary network or provider problem.

### NOT PROVABLE

- `seal-expired`: the server reports that the sealed replay expired before it
  could be proved, including terminal `410`.
`425`, `429`, and a temporary `503` are non-terminal retry states. They do not
emit `fail` or `not-provable`. An unavailable direct browser-RPC re-fetch is
also retryable and preserves the sealed/completed run. No terminal
`upstream-exhausted` event exists until a bounded retry budget is actually
implemented. A user who leaves during a retry remains an attempted but
unresolved run; this is visible in the raw-count reconciliation.

## Privacy and data minimization

Only the fixed categorical segments enumerated in this document may be sent in
manual funnel paths. Market Dungeon must not send any of the following through
the v2 funnel:

- wallet or account address;
- transaction hash, block hash, or block number;
- market ID, market key, contract address, pool address, or outcome ID;
- replay seal, commitment, salt, proof JSON, raw call data, or raw call result;
- combat actions, transcript, digest, seed, damage, inventory, or exact gold;
- challenge token, challenge digest, challenge URL, or other artifact ID;
- exact elapsed time or event timestamp;
- name, email, social handle, IP-derived identifier, or free-form text;
- exception text, provider response, or arbitrary query parameter.

Per-run deduplication flags and timing may live in memory. They must not become
cross-site identifiers. A challenge token may be validated for gameplay, but it
must never be copied into the analytics path.

The normal Vercel pageview product has its own documented processing. This
specification governs Market Dungeon's additional manual funnel labels and does
not claim to alter Vercel's underlying service.

## Automation and the meaning of “human”

Manual funnel emission is suppressed when `navigator.webdriver === true`.
Scheduled Market Dungeon smoke tests must also use `/judge?automation=1` (or
the same fixed `automation=1` marker on another route); the emitter recognizes
only that exact value and suppresses funnel emission. This is a second control
if browser behavior changes. Arbitrary query content is never copied into an
event label.

These controls exclude known project automation. They do **not** prove that all
remaining events came from humans: other automation can omit WebDriver signals,
and aggregate pageviews cannot establish personal identity. Therefore:

- analytics-only results must be described as **non-WebDriver event volume**;
- “human participants” may be claimed only for a recruited or supervised pilot
  with an anonymized participant log and no identifying analytics payload;
- event pageviews must not be described as unique users; and
- challenge events must not be described as unique challenges or people unless
  a separate privacy-safe pilot log establishes that fact.

The strongest competition evidence combines the v2 counts with an anonymized
pilot log using participant labels such as `P01`, device class, completion
status, duration bucket, and verifier result. Names, handles, wallet addresses,
and proof identifiers are unnecessary.

## Derived metrics and acceptance formulas

All divisions report both numerator and denominator. A zero denominator is
reported as `N/A`, never as zero percent.

Let:

- `L` = all `judge/locked/*` events;
- `R` = all `judge/reveal-attempted/*` events;
- `P` = all `judge/verified/*` events;
- `F` = all terminal `judge/verification/fail/*` events;
- `N` = all terminal `judge/verification/not-provable/*` events;
- `D<120` = verified events in `under-60s` plus `60-119s`;
- `C` = all Continue-on-dreamDEX events from verified Judge runs;
- `CC`, `CO`, and `CV` = challenge created, opened, and verified events.

| Metric | Formula | Acceptance interpretation |
| --- | --- | --- |
| Verified Judge completion | `P / L` | Target at least 70%, with at least 30 qualified starts. |
| Reached verification | `R / L` | Diagnostic separation of combat abandonment from verifier performance. |
| End-to-end proof-verification success | `P / R` | Conservative 95% gate; unresolved or abandoned attempts reduce the rate. |
| Resolved-verifier pass rate | `P / (P + F + N)` | Secondary diagnostic for terminally classified runs only. |
| Terminal integrity-failure rate | `F / (P + F + N)` | Must be reported separately from availability failures. |
| Terminal not-provable rate | `N / (P + F + N)` | Measures terminal evidence unavailability. |
| Below-two-minute share | `D<120 / P` | Strictly greater than 50% conservatively proves a sub-two-minute median. |
| Continue-on-dreamDEX intent | `C / P` | Target may be 25%; this is click intent, not trading conversion. |
| Challenge response ratio | `CO / CC` | Descriptive event-volume ratio only; the fixed link provides no causal source-to-recipient attribution and one prepared link can produce many opens. |
| Challenge verified rate | `CV / CO` | Event-volume ratio only unless distinct participants are confirmed separately. |

The pilot gate requires raw counts of at least 30 qualified Judge starts, at
least 70% verified completion, a conservative median below two minutes, at
least ten challenges created, five opened, three verified, and at least 95%
proof-verification success. Shannon wallet/fill targets are recorded separately
and must not be inferred from this browser funnel.

## UTC reporting template

Copy this section for each immutable reporting window.

### Window identity

| Field | Value |
| --- | --- |
| Candidate commit | `<40-character commit>` |
| Immutable release tag | `<tag or NOT RELEASED>` |
| Production URL | `<URL>` |
| Schema | `market-dungeon-funnel-v2` |
| Window start, inclusive | `<YYYY-MM-DDTHH:MM:SSZ>` |
| Window end, exclusive | `<YYYY-MM-DDTHH:MM:SSZ>` |
| Analytics extraction time | `<YYYY-MM-DDTHH:MM:SSZ>` |
| Evidence source | `<dashboard export/screenshot path or link>` |
| Anonymized pilot log | `<path/link or NOT AVAILABLE>` |
| Known automation excluded | `<yes/no plus method>` |
| Deployment or schema changes inside window | `<none or exact UTC boundary>` |

### Raw event counts

| Event | Raw count |
| --- | ---: |
| Entry — home | `<n>` |
| Entry — direct | `<n>` |
| Entry — challenge | `<n>` |
| Locked — 5m | `<n>` |
| Locked — 15m | `<n>` |
| **Locked total (`L`)** | `<n>` |
| Reveal attempted — 5m | `<n>` |
| Reveal attempted — 15m | `<n>` |
| **Reveal attempted total (`R`)** | `<n>` |
| Verified — under 60s | `<n>` |
| Verified — 60–119s | `<n>` |
| Verified — 120–179s | `<n>` |
| Verified — 180s or more | `<n>` |
| Verified — unknown duration | `<n>` |
| **Verified total (`P`)** | `<n>` |
| FAIL — server rejected | `<n>` |
| FAIL — browser mismatch | `<n>` |
| **FAIL total (`F`)** | `<n>` |
| NOT PROVABLE — seal expired | `<n>` |
| **NOT PROVABLE total (`N`)** | `<n>` |
| Continue on dreamDEX — verified Judge run | `<n>` |
| Share engaged — Judge Demo | `<n>` |
| Share engaged — full run | `<n>` |
| Native share completed | `<n>` |
| X intent opened | `<n>` |
| Card downloaded | `<n>` |
| Text copied | `<n>` |
| Challenge created (`CC`) | `<n>` |
| Challenge opened (`CO`) | `<n>` |
| Challenge verified (`CV`) | `<n>` |

Break down `verified` by interval, result, and direction in the retained source
evidence. The primary report may aggregate those dimensions only after checking
that their sum equals `P`.

### Reconciliation

| Check | Expected relationship | Observed |
| --- | --- | --- |
| Start-to-reveal | `R <= L` | `<values>` |
| Terminal classifications | `P + F + N <= R` | `<values>` |
| Unresolved/abandoned reveals | `R - (P + F + N)` | `<n>` |
| Duration buckets | Sum of five verified duration buckets equals `P` | `<values>` |
| Challenge funnel | `CV <= CO`; explain any cross-window exceptions | `<values>` |

The challenge URL is intentionally fixed and identifier-free. A prepared link
can be opened many times, and a challenge entry can open in one window and
verify in another. Therefore `CO <= CC` is not expected, and even `CV <= CO`
can be broken by a reporting-window boundary. Report raw event volumes and any
known carry-in; do not infer or manufacture sender-to-recipient pairs.

### Calculated results

| Metric | Numerator | Denominator | Result | Target | Pass? |
| --- | ---: | ---: | ---: | ---: | --- |
| Verified Judge completion | `<P>` | `<L>` | `<% or N/A>` | `>=70%` | `<yes/no/not enough data>` |
| Reached verification | `<R>` | `<L>` | `<% or N/A>` | Diagnostic | `—` |
| End-to-end proof success | `<P>` | `<R>` | `<% or N/A>` | `>=95%` | `<yes/no/not enough data>` |
| Resolved-verifier pass rate | `<P>` | `<P+F+N>` | `<% or N/A>` | Diagnostic | `—` |
| Below two minutes | `<D<120>` | `<P>` | `<% or N/A>` | `>50%` | `<yes/no/not enough data>` |
| Continue intent | `<C>` | `<P>` | `<% or N/A>` | `>=25%` | `<yes/no/not enough data>` |
| Challenge open rate | `<CO>` | `<CC>` | `<% or N/A>` | Raw-count gate | `—` |
| Challenge verified rate | `<CV>` | `<CO>` | `<% or N/A>` | Raw-count gate | `—` |

### Qualification and wording

- Qualified starts from recruited/supervised human participants: `<n or NOT ESTABLISHED>`
- Raw non-WebDriver locked events: `<L>`
- Distinct challenge shares confirmed in the anonymized recruited-pilot log: `<n or NOT ESTABLISHED>`
- Distinct challenge participants confirmed in the anonymized log: `<n or NOT ESTABLISHED>`
- Sample classification: `<credible competition pilot / usability pilot / telemetry only>`
- Known limitations: `<plain-language list>`

If fewer than 30 human starts are independently established, the report must
say **usability pilot** or **telemetry**, publish the raw counts, and avoid
claims of conversion, adoption, retention, or product-market fit.

## Release evidence checklist

- [ ] Exact candidate commit and v2 deployment recorded.
- [ ] UTC window and extraction timestamp recorded.
- [ ] Known scheduled automation suppressed and documented.
- [ ] Raw path counts retained as screenshot or export.
- [ ] Aggregate sums reconciled before percentages are calculated.
- [ ] Denominators shown beside every percentage.
- [ ] Duration claim uses buckets and includes `unknown` in `P`.
- [ ] `FAIL` and `NOT PROVABLE` remain separate.
- [ ] Continue is described as intent, never as a trade.
- [ ] Share actions are not described as posts or impressions.
- [ ] Challenge event volume is not described as unique people without a
      separate anonymized pilot log.
- [ ] Samples below the acceptance threshold are labeled honestly.
- [ ] No legacy v1 count is mixed into the v2 window.
