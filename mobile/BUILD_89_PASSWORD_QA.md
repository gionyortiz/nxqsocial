# NXQ Social 1.0.8 / build 89 password-management candidate

Prepared 2026-09-02 on `codex/nxqsocial-password-management-89`, from build 88
source `aa95404382d0ac6a2cbb1b129bbac1ce549169bc` in an isolated worktree.
The final commit and EAS build record identify the packaged source.

## Release boundary

This is a candidate, not a declaration that all iPhone/password issues are fixed.
Windows component tests and an iOS JavaScript export cannot exercise UIKit's
keyboard, iCloud Passwords, native paste menus, actual email delivery, or the
App Store binary. **Real-device acceptance is required before App Review.**

No backend changes, database/account mutations, web deployments, GPU operations,
Apple submission, or unrelated agent edits are included. EAS owns the remote
build number; its value was 88 before packaging. The local stale build number
was removed. Version 1.0.8 remains the replacement candidate for unsubmitted 88.

## Changes

- Shared native password field for login, registration, reset, and password change
  (eight fields). Manual typing/paste retained; no normalization or trimming.
- Automatic password suggestions remain disabled as the iOS workaround; there is
  no claim of full native password-manager autofill support. Pasting is allowed.
- Visible focus state; keyboard next-field navigation; separate show/hide target
  that does not overlap the input; mask again on background/navigation/submit.
- Shared dark NXQ-branded keyboard-aware forms and accessible errors/buttons.
- Live new-password checklist and exact confirmation. Existing login credentials
  are not subjected to a new strength rule. New passwords are limited to 72 UTF-8
  bytes to avoid bcrypt suffix truncation by the existing API.
- Single-flight submission guard and server Retry-After countdown. No automatic
  retry of authentication mutations after an uncertain network response.
- Forgot-password destination guidance, generic non-enumerating confirmation,
  explicit resend cooldown, and no false assertion of email delivery.
- Invalid/ambiguous reset links refused. Opening a different reset link resets
  the form; a late response from the previous form cannot mark the new one done.
- Profile -> Password & security uses the existing authenticated change endpoint.
  Incorrect current password no longer signs out a valid session; an expired JWT
  still does. Success correctly states that other devices are not signed out.
- Arbitrary auth error messages/codes excluded from proof logs. Passwords are
  cleared after success. Existing session credentials remain in native secure
  storage, and leftover legacy AsyncStorage tokens are cleaned up on restore.
- Compatible Expo SDK 57 patch packages aligned to `expo-doctor` recommendations;
  no SDK-major, React, or React Native upgrade.

## Reproducible automated checks

From `mobile/`:

```text
npm ci --ignore-scripts
npm run check:passwords
npx expo-doctor
npx expo export --platform ios --output-dir dist-ios-auth89-check
npm audit --omit=dev
```

Verified locally: typecheck; eight password-field static checks; 25 release
invariants; 69 behavioral tests in five suites; no Jest open handles; 21/21 Expo
Doctor checks; iOS Hermes export. API, session, and Turnstile tests use synthetic
fixtures/mocks and do not contact production or create accounts/send mail.
These are distinct automated cases, not 69 real-device or end-to-end tests.

The React review checklist informed predictable field identity/state, duplicate
submit guards, timer/listener cleanup, and keyboard/accessibility behavior.

## Known limits and dependency findings

- No real iPhone/iPad test has been performed for this candidate yet.
- The existing API does not revoke other device sessions after a password change.
  This client does not claim or silently implement server-side revocation.
- The 72-byte creation limit is client-side; consistent enforcement across web/API
  clients requires separately reviewed backend work.
- Existing logout uses best-effort credential deletion. Automated tests prove all
  deletions are attempted, not that a failing device Keychain always deletes data.
- `npm audit --omit=dev` reports 14 moderate dependency entries, zero high/critical,
  arising from two root advisories. Full audit reports 16 moderate entries.
  They have not been suppressed or labeled fixed:
  - [decode-uri-component](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr):
    Expo Router -> query-string 7.1.3 -> decoder 0.2.2. Malformed URL input can
    cause excessive work before a route's input validation runs. Patched 0.5.0
    changes to ESM and is not a drop-in override for query-string's CommonJS
    callable import. Resolve with compatible routing changes and link tests
    before claiming a clean security audit/public-release readiness.
  - [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq): Expo config tooling
    -> xcode -> uuid 7.0.3. Inspected xcode code uses v4; the advisory concerns
    v3/v5/v6 buffer arguments. This is not evidence of a password-entry failure,
    but the dependency remains flagged.
  Do not use `npm audit fix --force`: its proposals include incompatible Expo
  and router downgrades. The remaining findings need explicit release review.

## Real iPhone acceptance gate — currently NOT RUN

Record device model, iOS version, app version/build, tester, timestamp, and results.
Use an authorized disposable test account, not an admin/reviewer password. Do not
record passwords, reset tokens, access tokens, or private email contents in evidence.

1. Confirm installed version 1.0.8 **build 89**, not the live 1.0.7/build 87.
2. Fresh install: type, delete, replace, and paste into both registration fields;
   repeat with iCloud Passwords enabled and disabled, and a hardware keyboard if used.
3. Repeat input checks in login, both reset fields, and all three change fields.
4. Toggle each eye control repeatedly, continue typing, blur/refocus, and background/
   foreground. Exact value must remain unchanged and obscured when backgrounded.
5. Keyboard Next must focus the next field. Scroll to every control on a small
   iPhone; repeat with large Dynamic Type/VoiceOver and on an iPad.
6. Validate missing/weak/mismatched/over-72-byte passwords, spaces and Unicode,
   then correct them without losing input or the ability to type.
7. Complete Turnstile and registration -> real verification mail/code -> feed.
   Expired/failed challenges must have a usable retry and cannot bypass security.
8. Login with wrong password, then correct password. Test offline/timeout and
   rate-limit states. Rapid taps must not duplicate submissions.
9. Request reset mail; verify actual receipt independently. Use newest link,
   reset successfully, reject reused/expired links, then sign in with new password.
10. From profile change password: wrong current password must leave session active;
    correct change must succeed. Old password fails login; new password succeeds.
11. Genuine expired session redirects to sign-in. Logout/relaunch does not restore
    a signed-out session. Upgrade from build 87 migrates a valid session safely.
12. Smoke-test feed, profile, navigation and existing app flows after auth. Record
    failures as blockers; do not substitute a successful compile for these checks.

Upload to TestFlight and App Review are separate actions. Do not auto-submit this
candidate or publish an OTA update as a shortcut around the acceptance gate.
