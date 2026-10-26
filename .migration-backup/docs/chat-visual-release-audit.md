# Chat visual inspection release audit

## Delivered

- Saved activity stream and paired screenshot workspace inside saved chats,
  including passive history with Project Agent off.
- Explicit remote preview/image sharing consent; no capture/review on reconnect.
- Before/After source fingerprints, private image opening/download and report
  export; stale, denied, failed and uncertain outcomes remain visible.
- Trusted versioned inspection profile, structured six-check desktop/mobile
  observations, immutable workspace/source targets and three-depth repair
  lineage. Unstructured model output is not upgraded into a passing checklist.
- Idempotent repair preparation, deliberate composer submission, existing
  reviewed source approval and changed-source recapture.
- No storage migration, tariff change, unrestricted source write or automatic
  customer deployment from a model's opinion.

## Verification evidence

- Full suite: 121 test files passed; 1,017 tests passed, 1 skipped.
- Production client/server build passed. Existing large-chunk warnings remain.
- TypeScript: 56 existing diagnostics; none in the changed production files.
  The overall repository is not type-clean.
- Development workflow restarted and serves health HTTP 200. Anonymous visual
  history and event requests return HTTP 401.
- Desktop 1280x800 and mobile 375x812 `/chat` screenshots render authentication.
  The screenshot browser cannot sign in: these captures do **not** verify the
  signed-in chat visually. Signed-in component/action behavior is covered by
  mocked API tests, not a live browser acceptance test.
- Cross-owner denial, private reports, immutable source, stale/partial capture,
  bounded repair lineage, idempotent paid review, explicit consent and activity
  cleanup are tested. Actual provider and database calls in these tests are mocked.

## Outstanding gates

1. Real Browser Rendering permission probe returns HTTP 401 using the existing
   runtime credential. Capture remains disabled by default. Do not claim that
   real paired capture or the real screenshot-to-model roundtrip is certified.
2. Dependency scan reports 0 critical, 32 high, 69 moderate and 11 low findings
   across the repository. Broader dependency remediation remains separate.
3. Static scan reports nine SQL alerts on parameterized PostgreSQL queries and
   one file-read alert on the founder-only canonical/symlink-protected file
   route. Code inspection and passing regression tests support the safeguards;
   automated alerts are not dismissed as proof of complete security.
4. Privacy scan could not complete because its output failed schema validation,
   twice. This is an unavailable scan, not a clean privacy result.
5. A source push does not update the VPS. The intended site is afroaigroup.com,
   served by the existing VPS release script, separate from Replit publication.
   Confirm the live revision and frontend assets after the production release.

## Production handoff

Use the existing root-run deployment script on the intended VPS after the
reviewed source push:

```sh
bash /opt/afro-ai/scripts/deploy.sh
```

Do not manually pull first or discard an unexpected dirty production tree.
The script handles its lock, pull, build, recovery snapshot, service health
checks and cache purge. Keep screenshot capture gated until its authorization
is resolved. Verify the signed-in chat and actual capture separately from
HTTP health or source-upload success.
