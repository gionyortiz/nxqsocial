# NXQ Social password native-focus hotfix

Prepared 2026-09-02 on `codex/nxqsocial-password-focus-hotfix`, from clean local
build-89 record `edebffbd048f18e05c211dd1753e70d77f1aec2b`. Build 89's signed
source was `2c9c536056597740c75b420603c60b8eea6e4c92`.

Status: **source fixed and locally checked; new signed binary/upload NOT yet
started; real-iPhone acceptance NOT yet passed.** Internal TestFlight only remains
the intended next step. Public App Store review and external testers are excluded.

## Evidence and narrow change

The shared PasswordField added a shadow when focused. This changes Fabric's
native stacking-context trait, matching the focus/keyboard-dismissal pattern in
[React Native issue 45798](https://github.com/facebook/react-native/issues/45798).
Installed React Native 0.86.3 `ViewShadowNode.cpp` includes meaningful shadowColor
and `!collapsable` among the native stacking-context conditions. A source match
is not a captured UIKit trace, so the exact iPhone cause remains to be confirmed.

The fix sets `collapsable={false}` on the password shell and uses border color only
for focus feedback. This keeps native parent grouping stable while retaining
masking, exact password values, paste, show/hide, validation and existing handlers.
The shared fix applies to all eight fields across login, registration, reset and
change-password screens. No credentials, API behavior, backend, website, signing
capabilities, dependencies or provider code changed.

React review checked component identity, event forwarding and the absence of new
focus effects or field remounts. Build 89's failed device gate is now documented
in its historical QA report; previous passing automated checks remain historical.

## Checks performed

- Added `tests/password-focus.test.tsx` before changing the component. On original
  build-89 source, two tests failed for the expected reasons: focus added three
  shadow properties; the native shell was not explicitly non-collapsable. The
  callback-forwarding test passed.
- Applied the component patch. `npm run check:passwords`: **72/72 tests across six
  suites passed twice**, type-check passed, eight field guards passed, 25 release-safety
  assertions passed. Focus regression includes 20 simulated focus/blur cycles.
- `npx expo-doctor`: **21/21 passed**.
- Clean `npx expo export --platform ios`: **PASS**, 1,945 modules, 44 assets, one
  6.3 MB Hermes bundle. This is a JavaScript export, not an Xcode-signed archive.
  Hermes SHA-256: `7807B0CBF91A370F84287299EFE57E14239FF41E3F60250C4B5E87AF423993AE`.
- `git diff --check`: passed.
- Read-only EAS production version query returned current build number **89**;
  expected next auto-increment is **90**, subject to rechecking when building.

The generated export is retained outside the Git worktree in the current task's
`nxq-password-focus-20260902/dist-ios-focus-hotfix` artifact folder. It is not
included in source commits or used as a production OTA update.

## Required real-device gate

Do not report this problem resolved for users based on Jest alone. Record the
actual installed build number, phone model and iOS version for the next test.

1. Tap directly in each registration password field. Keyboard must appear and
   stay open; type a disposable test value, delete, paste and edit in the middle.
2. Test Next from display name to password and from password to confirmation.
3. Tap eye repeatedly, continue editing, blur/refocus, dismiss/reopen the keyboard,
   and background/return. Values must not clear or reveal unexpectedly.
4. Repeat for login, reset-password and change-password fields, including larger
   text settings and Password AutoFill enabled. Do not require users to disable
   system password-manager settings to use the app.
5. Complete the relevant authenticated workflows with an authorized disposable
   test account. Do not use admin/reviewer secrets in logs or recordings.

If focus still fails, capture internal-only touch/focus/blur/keyboard event names
without text, tokens, email or password lengths before another speculative build.

The previously documented dependency-security findings remain open; this narrow
focus repair does not resolve them or authorize public release.
