# Native password-reset request reliability candidate

## Incident reproduced

On build 90, a real iPhone completed email verification and then failed the
`POST /auth/forgot-password` transport before the production API received the
request. No reset email appeared in Resend. The mobile client intentionally
made only one mutation attempt, so the customer had no in-app recovery path.

## Candidate contract

- Each deliberate press creates one cryptographically random UUID with Expo
  Crypto and prefixes it with `nxq-reset-`.
- The native client may retry exactly once only after a recognized network,
  timeout, DNS, or TLS failure.
- Both attempts contain the same request body and the same validated
  `Idempotency-Key` header.
- HTTP responses are never retried, including 400, 401, 403, 409, 429, and
  5xx responses.
- The backend derives the same 256-bit reset secret from the email, request ID,
  and server-side OTP pepper. Only its SHA-256 hash is stored.
- A database upsert preserves that token across a replay while invalidating
  unrelated unused reset tokens.
- Resend receives the same idempotency key and identical message, so its
  24-hour idempotency boundary suppresses a duplicate provider send.
- Unknown accounts still receive the same generic API response. Raw email,
  reset token, request key, URL, exception text, IP, and SSID are excluded from
  mobile diagnostics.

## Automated evidence

- Mobile: 128 tests across 9 suites passed.
- Password-entry guard: 8 fields passed.
- Release-safety guard: 25 assertions passed.
- Backend: 263 tests across 31 suites passed.
- Expo Doctor: 21/21 checks passed.
- iOS Hermes JavaScript export passed with 1,956 modules.
- Mobile production dependency audit: 14 moderate, 0 high, 0 critical. These
  are the inherited Expo dependency findings; no forced downgrade was applied.

## Release ordering and hold

The backend contract must be reviewed and deployed before any TestFlight build
using the retry is enabled for testers. Otherwise the older API would ignore
the request key and could create two reset links after a lost response.

This candidate is internal-TestFlight only. It must not be submitted for public
App Store review until a real iPhone passes:

1. Wi-Fi request succeeds and exactly one email is created.
2. Cellular request succeeds and exactly one email is created.
3. Simulated first transport failure recovers without a second provider email.
4. The newest link opens, accepts a strong password, and signs in successfully.
5. Invalid, expired, and already-used links remain rejected.

No production deployment, account mutation, live reset email, TestFlight upload,
external testing, or App Store submission is part of this code-only candidate.

The native candidate uses app/runtime version `1.0.9`, isolating its Expo Crypto
and Expo Network native modules from the installed `1.0.8` builds 89/90.
