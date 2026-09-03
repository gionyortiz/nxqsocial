# Native email-verification reliability candidate

Prepared September 2, 2026 (America/New_York). **Draft, not deployed, not a
signed build, and not approved for public App Review.**

## Scope and prerequisite

- Head branch: `codex/nxqsocial-verification-reliability`.
- Stacked base: `codex/nxqsocial-password-focus-hotfix` at
  `a406907f20b87cc762e2a4caa82a6cbca420bc60` (build-90 record).
- Build 90's signed source was `b84942f03e7eccf0e806f3d887a2d598ae3bccd1`.
  The user subsequently confirmed password typing worked, then reported an
  email-verification connection error. That is not a complete device pass.
- The prerequisite candidate is not yet merged into
  `release/railway-staging-20260823`. This stacked PR isolates the new mobile
  reliability delta; it does not approve the prerequisite's wider changes.
- This delta changes only mobile verification/auth code, its tests/dependency,
  this record, and a mobile-only CI workflow. No backend, web, password-field,
  database, signing, App Store metadata, API-origin, CSP/CORS, provider or GPU
  change. PR #6 (web registration) and unrelated PRs are untouched.

## Incident interpretation

The screenshot's old message reports a request failing without a usable fetch
response. It does not identify Wi-Fi, cellular, DNS, TLS, Cloudflare, or the API
host as the cause. A lost response after a committed verification is possible.
The incident account was confirmed verified during the preceding read-only
investigation; no OTP from a screenshot was used or resent for this work.

This patch improves bounded recovery; it does not claim to repair or identify
the underlying transport fault. Safari connectivity is useful evidence, not
conclusive isolation of a native-stack defect, because timing/routes can differ.

## Recovery and safety contract

1. Native iOS/Android `POST /auth/verify-email` explicitly opts into at most two
   attempts: the original plus one retry after a recognized transport failure.
   Both use the same verification token and code. Each fetch retains the
   existing 12-second timeout; the retry delay is 500 ms. Unknown exceptions
   and web verification do not receive this new retry policy.
2. No HTTP response is retried, including invalid-code responses, 400, 401, 403,
   409, 429 and 5xx. HTTP parsing/validation errors cannot create a session.
3. `EMAIL_ALREADY_VERIFIED` clears pending verification and routes to login with
   an explanatory notice. It never grants a session from the verification token.
   A normal success must contain `verified: true`, a nonempty access token and
   the expected user ID before storing a session.
4. Resend is capped at one request, even if a future caller accidentally opts
   into retries. A synchronous shared tap lock prevents overlapping verify,
   keyboard-submit and resend actions. An uncertain resend reports uncertainty
   and imposes a 60-second manual cooldown; it never claims delivery or sends a
   replacement OTP automatically. Server rate-limit countdowns remain enforced.
5. Responses arriving after the pending session has been cleared cannot restore
   it or store a verification-success token. Unmounted screens do not navigate
   or update local UI state from late callbacks.
6. Persistent connection failure keeps the client unauthenticated, preserves
   the pending state and offers return to sign in. Backend verification/locking
   rules are unchanged. This is bounded replay, not general idempotency: if an
   invalid-code response is lost, the retry can consume another server attempt.
   The existing server attempt limit remains in force.
7. Diagnostic payloads contain only endpoint class, coarse failure class,
   whitelisted connection type and attempt count. No OTP, verification/session
   token, password, email, URL, IP, SSID, raw exception or response body is logged
   by the new diagnostics. Missing/hung connectivity APIs produce `UNKNOWN`
   within a 200 ms budget. The optional native module loads inside the failure
   boundary, so absence cannot crash app startup. Generic native fetch failures
   stay classified as `network`; they are not guessed to be DNS or TLS.
8. The screen uses the existing safe-area dependency and scrolls its recovery
   message/controls, retaining OTP autofill and accessible labels.

## Automated evidence

All request fixtures are synthetic. Tests neither contact production nor send
email, create accounts, verify real users or rent infrastructure.

- Test-first API run against the old implementation: 6 failed / 12 passed;
  failures covered the missing bounded retry and sanitized diagnostics.
- `mobile: npm run check:passwords`: **111/111 tests, 8 suites passed**,
  including 39 new verification API/flow tests, TypeScript, the eight-field
  password-entry guard and 25 release-safety assertions. No open handles.
- Cases include network failure then success; lost success then already-verified;
  invalid code; HTTP status boundaries; two actual AbortController timeouts;
  coarse DNS/TLS classification; missing/hung/unrecognized connectivity;
  no duplicate/automatic resend; rate-limit countdown; expired code; malformed
  success; mismatched user; and late responses after session clearing.
- `npx expo-doctor`: **21/21 checks passed**.
- `npx expo export --platform ios`: **passed**, Hermes bundle, 1,949 modules.
  This is a JavaScript export, not a signed/native-device validation.
- Existing backend `auth.service.spec.ts` and `otp.service.spec.ts`:
  **15/15 tests passed** after installing lockfile dependencies and generating
  Prisma Client locally. Database/Redis/mail services are mocked; no migration
  or server connection was performed. No backend files were edited.
- `git diff --check`: passed.
- Added `Mobile reliability` GitHub workflow: clean `npm ci`, the complete mobile
  check command and iOS export. Read-only repository permissions; no signing,
  deployment credentials, EAS upload, OTP or production requests.

## Outstanding release gates

- `expo-network ~57.0.1` is SDK-compatible and is the only dependency added.
  A new native internal-test binary is required to exercise it. **Do not publish
  an OTA to builds 89/90.** Before any later build/release, review runtime-version
  isolation: the inherited `appVersion` policy still uses 1.0.8 and must not be
  treated as proof that old binaries contain this native module. No runtime,
  version, channel or signing setting is changed by this PR.
- Current `npm audit --omit=dev`: **14 moderate, zero high/critical entries**.
  The known findings described in `BUILD_89_PASSWORD_QA.md` remain unresolved;
  no forced upgrades, suppression or claim of a clean security audit.
- Actual iPhone/iPad networking, keyboard, backgrounding and connectivity-change
  acceptance is still pending. Record exact future build, device, iOS version,
  connection type and timestamps. Never include codes or credentials in evidence.
- With an authorized disposable account on that future internal build, pass:
  registration -> received email -> verification -> authenticated feed; repeat
  on Wi-Fi and cellular, then cover offline/timeout recovery, already-verified
  login recovery, invalid/expired code, and duplicate-tap/resend behavior.
- No merge, deployment, OTA, native build, TestFlight upload, external testing or
  public App Review submission is authorized or performed by this change.
