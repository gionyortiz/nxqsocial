# NXQ Social Release Status

Date: 2026-06-21
Project: NXQ Social mobile
Owner: gionyortiz

## Overview
This is the single source of truth for the current release state across Apple and Google Play.

## Status Changelog

### 2026-08-23 Expo SDK 57 code-only migration candidate

- The current candidate source targets Expo `57.0.16`, React Native `0.86.2`,
  React Native Reanimated `4.5.1`, Worklets `0.10.1`, and app/runtime `1.0.7`.
- The required LiveKit Expo plugin and `expo-dev-client` are present. LiveKit is
  pinned to `2.12.0` with WebRTC `144.1.2`, removing the known 144.1.0
  audio-state deadlock path.
- Expo Doctor passes 21/21, `expo install --check` is clean, TypeScript passes,
  production Android/iOS JavaScript exports pass, and an isolated staging
  Android export passes.
- Production and staging Android CNG prebuilds pass. iOS JavaScript export
  passes, but native iOS prebuild cannot be generated on this Windows host.
- `staging-native` is intentionally non-deployable until separate Railway URLs
  and a separate Expo staging project exist. It has distinct bundle/package
  identifiers, no channel, OTA disabled, push disabled, and fail-closed config
  validation that rejects placeholders and production hosts.
- No EAS build, OTA update, channel mutation, submission, store publication, or
  paid Expo action was performed.

Release interpretation for this candidate: the SDK 56 Hermes dependency
blocker is removed from source, but **MOBILE NO-GO remains** until independent
diff review, native staging builds, and physical-device E2E pass.

### 2026-08-23 Railway-staging worktree superseding gate

- The public App Store state below remains historical evidence for live version
  `1.0.6`; no newer store state was asserted in this check.
- The current registration worktree adds native `react-native-webview` for the
  Turnstile flow. The identified 1.0.6 iOS binary does not contain that module,
  so this change is **not eligible for an OTA-only update**.
- Expo Doctor passes 21/22 checks but blocks this worktree on the Expo SDK 56 /
  Hermes V1 memory regression. A separately reviewed upgrade to Expo 57.0.9+
  and React Native 0.86.2+ is required before a mobile release candidate.
- Mobile TypeScript passes. No EAS build, OTA update, App Store submission, or
  Google Play publication was authorized or started.

Release interpretation for the current worktree: **MOBILE NO-GO** until an
authorized native staging build includes the WebView dependency, removes the
Hermes blocker, and passes staging registration/device E2E. This supersedes the
2026-06-21 “Mobile store readiness: GO” statement for new source changes; it
does not change the already-live historical 1.0.6 status.

### 2026-08-05 App Store Live Confirmation
- Checked public App Store lookup (`itunes.apple.com/lookup?bundleId=com.gionyortiz.nxqsocial`).
- App is **live** on the App Store: https://apps.apple.com/us/app/nxq-social/id6775623679
- Original release date: `2026-06-22`.
- Current live version: `1.0.6`, released `2026-07-19`.
- This supersedes the `1.0 Waiting for Review` status below — the app was approved and published, and has since shipped at least one update (1.0.6) beyond the initial `1.0` submission tracked in this doc. The intermediate approval/version history (1.0 → 1.0.6) was not captured here and should be backfilled from App Store Connect if needed.
- Not verified in this check: Google Play production status (still shown below as internal-testing-only as of 2026-06-21).

### 2026-06-21 Release Gate Check
- Mobile typecheck: PASS (`npx tsc --noEmit` in mobile).
- Backend build: PASS (`npm run build` in backend).
- Frontend production build: PASS (`npm run build` in frontend).
- Production ops verification: PASS (`npm run ops:verify` at repo root).
- Frontend lint: FAIL (`npm run lint` in frontend) with existing repo-wide lint findings.

Release interpretation:
- Mobile store readiness: GO.
- Backend service readiness: GO.
- Frontend deploy readiness: GO for build/runtime.
- Code quality gate: NO-GO if strict lint-clean policy is required before release.

Top known lint categories (frontend):
- `react-hooks/set-state-in-effect`
- `@typescript-eslint/no-explicit-any`
- `react/no-unescaped-entities`
- hook order/dependency-related rule findings in admin/feed/feedback/verify pages.

### 2026-06-21 03:28 (Local Time)
- Confirmed App Store Connect iOS version status: `1.0 Waiting for Review`.
- Confirmed Expo iOS submission `7fada23c-0895-4c98-bd20-b53e3deead85` remains `Success`.
- Confirmed Google Play internal testing release is active and available to internal testers.
- Confirmed Google Play latest release: `1.0.0 (46) internal`.

### 2026-06-21
- Expanded this document to replace separate platform-specific release notes.
- Confirmed Android parity implementation work is complete and documented.
- Confirmed Android production/store build exists and is ready for internal testing.
- Confirmed Apple-facing policy and reviewer-readiness work is complete.

### 2026-06-20
- Initial Apple and Android release work was documented separately.
- Policy/consent verification notes were captured from registration flow.
- iOS submission details were captured from Expo.
- Android parity and QA evidence documents were created.

## Apple Status

### Current Apple State
- **Live on the App Store** (confirmed 2026-08-05 via public iTunes lookup API): https://apps.apple.com/us/app/nxq-social/id6775623679
- Current live version: `1.0.6`, released `2026-07-19`
- Original release date: `2026-06-22`
- Prior tracked status (now superseded): App Store Connect inflight status `1.0 Waiting for Review`
- Expo submission status: `Success`
- Submission ID: `7fada23c-0895-4c98-bd20-b53e3deead85`

### Apple Work Completed
File: mobile/app/register.tsx
- Verified Terms of Service link is shown before account creation.
- Verified Community Guidelines link is shown before account creation.
- Verified Privacy Policy link is shown before account creation.
- Verified required checkbox exists for user agreement to Terms and Community Guidelines.

### Why Apple Is In Good Shape
- iOS submission pipeline executed successfully.
- App is live on the App Store, currently at version 1.0.6.
- No blocker is recorded for the already-live 1.0.6 binary. The current source
  worktree has the separate native-module/Hermes release blockers documented
  in the superseding 2026-08-23 gate above.

## Google Play Status

### Current Google State
- Internal testing track: active
- Latest release: `1.0.0 (46) internal`
- Availability: released to internal testers
- Review state: not reviewed, which is normal for internal testing

### Google Work Completed
Files:
- mobile/app/(tabs)/reels.tsx
- mobile/app/explore.tsx
- mobile/app/(tabs)/create.tsx
- mobile/app/register.tsx

What was completed:
- Reels moderation parity with report and block actions.
- Explore moderation parity with report and block actions.
- Create-screen video discoverability improvements.
- Registration policy/consent verification.

### Why Google Is In Good Shape
- Production Android build finished successfully.
- Internal testing release is live and visible in Play Console.
- Testers can now access the active release.

## Shared Work Completed

### Safety and Moderation
- Standardized report/block actions across post surfaces.
- Kept owner delete behavior intact.
- Aligned report categories across screens.

### Video Creation UX
- Added explicit `Record video` and `Upload video` actions.
- Kept generic camera/library options.
- Fixed media mode filtering and TypeScript issues.

### Validation
Command:
- `npx tsc --noEmit`

Result:
- Pass (exit code 0)

## Current Blockers
- Current iOS/Android source: native WebView is absent from identified 1.0.6
  binaries, so the registration change cannot ship OTA-only.
- Current iOS/Android candidate: the SDK 57 dependency migration passes local
  checks, but native staging builds and physical-device verification have not
  been authorized or completed.
- The `staging-native` profile remains intentionally locked until isolated
  Railway URLs and a separate Expo project ID are available.
- Google Play portal status has not been reverified since the historical entry
  above; do not infer production readiness from the old internal-testing note.

## Current Focus
1. Keep Railway work staging-only; do not publish an Expo/App Store update.
2. Keep the committed Expo SDK 57 candidate on the release branch and preserve
   its fail-closed staging configuration.
3. Unlock the isolated staging-native profile only after its Railway URLs and
   separate Expo project exist, then run registration and device E2E before
   revisiting store readiness.

## Evidence and Supporting Docs
- docs/QA_ANDROID_PARITY_VERIFICATION.md
- docs/PRODUCT_BENCHMARK_FB_IG_NXQ.md

## Update Template
Use this block for future release checks:

### YYYY-MM-DD HH:MM (Local Time)
- Platform checked: Apple / Google Play
- Source checked: <portal or submission page>
- Status: <exact current state>
- Reference: <submission ID, build ID, version, or release>
- Evidence attached: <screenshots/docs links>
- Blockers: <none or short summary>
- Next action: <single concrete action>
