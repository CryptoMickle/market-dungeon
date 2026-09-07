# Market Dungeon — pre-video readiness

Status: **Shannon candidate verified locally through ASTRA-WB-05 preparation;
ASTRA-WB-06 is in progress and human evidence remains open**

This record answers one question: what remains before the single final video can
be captured? Video work must not begin while a material product, evidence, or
release-identity change is still possible.

## 7 September Shannon candidate update

| ASTRA block | Status | Evidence or blocker |
| --- | --- | --- |
| WB-02 — fixed Shannon Judge/verifier | Complete locally | Implementation commit `2dfe0f484822a8ffcc7f7c2303cdc80f66896829`; [candidate record](SHANNON_JUDGE_RELEASE_CANDIDATE.md) |
| WB-03A — human usability pilot | Prepared; collection not started | The participant invitation remains unpublished pending separate manual user approval. Administrative routing evidence is private; invitations, participants, and sessions remain `0`. |
| WB-03B — targeted correction/retest | Technical QA complete; human retest not applicable yet | Chain label, Shannon continuation boundary, mainnet candidate compatibility, and strict parser were corrected from QA/security findings; dedicated Shannon browser test PASS |
| WB-04 — security and proof review | Complete locally | 61 focused tests and 1,575 malformed proof mutations passed; no open finding |
| WB-05 — truthful evidence package | Prepared, not final | Private zero-state pilot/evidence report exists; no human or telemetry result may be invented |
| WB-06 — one public frozen release | In progress, not complete | Branch push and first exact-identity Preview completed. Mainnet passed 20/20; Shannon exposed a case-sensitive indexer filter, so release was halted and corrected. New Preview, tag, Production gates, and independent validator results remain open. |
| WB-07 — final video | Stopped by design | Starts only after WB-06 is resolved and the user approves the final candidate |

Local checks for the corrected candidate: lint PASS, TypeScript PASS, 99/99
unit/integration tests, 7/7 Shannon proof-kernel tests, optimized build PASS, and
22/22 deterministic Chromium tests. A dedicated public-live Shannon test is
also staged alongside the existing mainnet live gate. These do not replace the
new exact-identity public live checks or human evidence.

## Work-block status

| Block | Status | Evidence or blocker |
| --- | --- | --- |
| WIN-WB-01 — winner position and scope | Complete | [`WINNER_POSITIONING.md`](WINNER_POSITIONING.md) fixes the thesis, five claims, surfaces, boundaries, and no-go list. |
| WIN-WB-02 — clean human pilot | Setup complete; external collection open | Production identity and UTC start are recorded in [`PILOT_RUN_2026-09-05.md`](PILOT_RUN_2026-09-05.md). Qualified participants and Vercel raw counts are pending. |
| WIN-WB-03 — judge proof surface | Source complete | [`JUDGE_EVIDENCE_PACK.md`](JUDGE_EVIDENCE_PACK.md) compresses the product, chain, release, test, and proof evidence without expanding claims. |
| WIN-WB-04 — surgical UX correction | No internal blocker found; pilot gate open | A fresh Production run completed lock, combat, reveal, verified result, card, proof actions, and Continue CTA. The deterministic suite covers desktop and 390 px mobile. No product change is justified unless human testing exposes a material blocker. |
| WIN-WB-05 — business/ecosystem evidence | Source complete; pilot numbers pending | The measurable funnel, evidence boundary, and 30/60/90-day path are in the judge evidence pack. |
| WIN-WB-06 — final release and independent validation | Prepared, not frozen | Validator instructions exist in [`INDEPENDENT_VALIDATION_RUNBOOK.md`](INDEPENDENT_VALIDATION_RUNBOOK.md). Final release identity waits for pilot closure and any resulting correction. Two non-team results remain pending. |
| WIN-WB-07 — final video | Not started by design | Begins only after every pre-video gate below is resolved. |

## Internal QA completed on 5 September 2026

- Production `/api/build` returned
  `abfac8ed7b8333d67b0b9388c08c109864d99f5b`.
- A fresh project-controlled Production Judge run reached a blessed,
  browser-reproduced Somnia result. Its WebDriver session was excluded from
  human analytics and is not counted as a pilot participant.
- Lint: PASS.
- TypeScript: PASS.
- Unit tests: 90/90 PASS on the pre-video branch, including two pilot-summary
  validation tests. The frozen v10 release evidence remains 88/88.
- Shannon proof-kernel tests: 7/7 PASS.
- Optimized production build: PASS.
- Deterministic Chromium tests: 21/21 PASS after rerunning outside the restricted
  local-port sandbox. The initial local server `EPERM` was an execution-environment
  restriction, not an application or test failure.
- Result hierarchy, two victory conditions, 2/2 replay progress, social card,
  challenge action, X intent, card download, proof actions, verifier link, and
  Continue-on-dreamDEX CTA were visible in the Production result.

## External gates before final freeze

1. Recruit and record the qualified pilot without coaching or personal data.
2. Close the UTC window and extract Vercel raw path counts.
3. Reconcile participant and event totals and publish honest numerators and
   denominators.
4. Decide whether the sample is a credible competition pilot, usability pilot,
   or telemetry only.
5. Apply only a material blocker found by the pilot. If behavior changes, open
   a new measurement window and keep versioned results separate.

## Final release sequence

After the pilot decision:

1. Replace all evidence `PENDING` values with real results or explicit unmet
   gates.
2. Freeze one final presentation candidate. If tracked source changes remain,
   create a new never-moved release tag rather than modifying v10.
3. Run the full local release suite on that exact commit.
4. Deploy Preview and confirm `/api/build` matches the exact commit.
5. Run the twenty-pass, zero-retry Preview live gate.
6. Create the frozen release tag and release record.
7. Deploy the identical commit to Production and repeat the twenty-pass,
   zero-retry live gate.
8. Obtain two non-team validation records against that tag and Production
   identity, or explicitly disclose that external validation was not obtained.
9. Freeze all visible copy and links.
10. Begin WIN-WB-07 and capture the video once.

## Video start gate

- [ ] Pilot window closed and classified.
- [ ] Pilot numbers inserted or the unmet gate stated explicitly.
- [ ] No unresolved material UX blocker.
- [ ] Final commit and never-moved release tag exist.
- [ ] Preview and Production identify the same final commit.
- [ ] Full local, Preview, and Production gates pass.
- [ ] Independent validation records linked or their absence disclosed.
- [ ] DoraHacks and YouTube copy are staged with no unresolved factual value.
- [ ] No visible product or evidence change remains after capture.

Until these boxes are resolved, the correct next action is evidence collection,
not video production.
