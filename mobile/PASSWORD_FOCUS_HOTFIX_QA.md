# NXQ Social password native-focus hotfix

Prepared 2026-09-02 on `codex/nxqsocial-password-focus-hotfix`, from clean local
build-89 record `edebffbd048f18e05c211dd1753e70d77f1aec2b`. Build 89's signed
source was `2c9c536056597740c75b420603c60b8eea6e4c92`.

Status: **build 90 available in internal TestFlight; real-iPhone
acceptance NOT yet passed.** The user explicitly authorized building and uploading
the next internal TestFlight beta. Public App Store review and external testers
remain excluded.

## Build 90 record

- EAS build: `a642dfcc-65f7-4eb2-8c27-e6ede563ba24`.
- [Build details](https://expo.dev/accounts/gionyortiz/projects/nxq-social-mobile/builds/a642dfcc-65f7-4eb2-8c27-e6ede563ba24)
- Confirmed version **1.0.8 (90)**; EAS incremented the remote counter from 89.
- Exact packaged commit: `b84942f03e7eccf0e806f3d887a2d598ae3bccd1`.
- Created: `2026-09-03T02:26:39.238Z` (September 2 in America/New_York).
- Completed: `2026-09-03T02:32:47.876Z`; EAS status **FINISHED**, no build error.
- IPA metadata independently checked: `com.gionyortiz.nxqsocial`, version 1.0.8,
  build 90. Embedded provisioning profile and code-signature resource file exist;
  this presence check is not a separate cryptographic signature verification.
- IPA SHA-256: `A3DC464530CAB9D81C07979E94CA86F892660B6FAA5B71991635FC521202A34F`.
- Uses existing store-signing credentials; no capability, credential, dependency,
  production website/API or OTA update change.
- The user signed into App Store Connect directly. Build and upload used the
  already-configured EAS credentials; no user password or verification code was
  requested in chat.

## Internal TestFlight upload

- Upload job: `0a87aff9-9ef0-4f48-a099-e1f8870b1a55`.
- [Upload details](https://expo.dev/accounts/gionyortiz/projects/nxq-social-mobile/submissions/0a87aff9-9ef0-4f48-a099-e1f8870b1a55)
- Scheduled the exact build ID above with the existing App Store Connect key
  managed by EAS. No new credentials created; no optional external distribution
  or public-review action performed.
- Destination App Store Connect app: `6775623679`.
- EAS upload status **FINISHED**, no submission error, verified after the official
  submission waiter completed on September 2 (America/New_York).
- Upload completion, Apple processing and internal-group availability are distinct
  gates; queuing the job alone is not proof the beta is installable.
- Read-only OTA check: production channel maps to production branch; no published
  iOS updates for runtime 1.0.8 were returned. No OTA changes were made.

### Apple availability verified

- Apple build ID: `aa634bdb-a5ad-457e-bace-ee662776cc41`.
- [Build 90 in App Store Connect](https://appstoreconnect.apple.com/teams/872f4dfe-2338-46bd-952f-ca31c3a3ccf8/apps/6775623679/testflight/ios/aa634bdb-a5ad-457e-bace-ee662776cc41)
- Build Uploads shows **1.0.8 (90), Complete**, created September 2, 2026,
  10:38 PM. Processing completed during this session.
- The build was automatically assigned to the existing **Internal** and **NXQ**
  groups, each explicitly listed as type **Internal**. No new testers or groups
  were created, and no group settings were changed.
- The NXQ group's Builds tab explicitly shows **1.0.8 (90), Testing** and
  "Expires in 90 days". The overall iOS list's "Ready to Submit" column does not
  negate internal availability; no beta external-review submission was made.
- Saved build-specific What to Test notes covering direct typing, paste, Next,
  show/hide, app backgrounding, larger text and all eight password fields.
- The existing user's device still reports **1.0.8 (89)**, iPhone 17 Pro Max,
  iOS 26.6.1. Installing 90 and real-device acceptance remain user steps. Group-wide
  historical session/crash counts are not build-90 results.
- No public App Store submission, external testing, OTA update, production API,
  website, GPU action or provider change occurred.

Important: both old and new beta show version 1.0.8. Device testing must confirm
the **build number is 90**, not 89. The new fix cannot change an installed 89 binary.

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
- Pre-build read-only EAS production version query returned build number **89**;
  the signed build record above subsequently confirmed auto-increment to **90**.

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
