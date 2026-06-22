# NXQ Social Release Status

Date: 2026-06-21
Project: NXQ Social mobile
Owner: gionyortiz

## Overview
This is the single source of truth for the current release state across Apple and Google Play.

## Status Changelog

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
- App Store Connect inflight status: `1.0 Waiting for Review`
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
- Live App Store Connect status shows the app waiting for review.
- No current Apple blocker is known from the latest captured status.

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
- Apple: none currently known.
- Google Play internal testing: none currently known.

## Current Focus
1. Keep this master release file up to date.
2. Capture screenshots/evidence for review and QA.
3. Update review notes only if Apple asks for follow-up.

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