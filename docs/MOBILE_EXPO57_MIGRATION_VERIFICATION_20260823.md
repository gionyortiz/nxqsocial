# NXQ Social Expo SDK 57 Code-Only Migration Verification

Date: 2026-08-23

Repository: `E:\webside\app\nexaquantum chat`

Branch: `release/railway-staging-20260823`

Base HEAD: `b2553be0d9dc7f96293b1779b462d54c1e1ce001`

## Scope boundary

This record covers an uncommitted code-only migration candidate. The two new
files `mobile/app.config.js` and this verification record are untracked and
must be explicitly included in any later reviewed commit; omitting
`mobile/app.config.js` would remove the staging safety boundary. This record
does not authorize or record an EAS build, Expo update, channel change,
submission, App Store or Google Play publication, DNS change, or paid action.

## Dependency and runtime result

| Area | Before | Candidate |
| --- | --- | --- |
| Expo | `~56.0.20` | `~57.0.15` |
| React Native | `0.85.3` | `0.86.2` |
| Reanimated | `4.3.1` | `4.5.1` |
| Worklets | `0.8.3` | `0.10.1` |
| Expo dev client | absent | `~57.0.14` |
| LiveKit Expo plugin | absent | `1.0.2` |
| LiveKit React Native | `^2.11.0` | `2.12.0` |
| LiveKit WebRTC | `^144.1.0` | `144.1.2` |
| WebRTC config plugin | `^15.0.1` | `15.0.2` |
| App/runtime version | `1.0.6` | `1.0.7` with `appVersion` runtime policy |

The package lock was regenerated and a clean `npm ci` completed successfully.
The LiveKit plugins are adjacent in the documented order: LiveKit Expo plugin
first, WebRTC config plugin second.

## Staging isolation

The new `staging-native` profile is standalone and internal-only. It:

- has no EAS Update channel and no submit mapping;
- sets `autoIncrement` false;
- uses required-value sentinels and `NXQ_STAGING_CONFIG_READY=false`;
- refuses to resolve until reviewed configuration supplies a non-production
  Expo project UUID and public HTTPS-shaped staging API, web, and Turnstile
  values;
- rejects missing/sentinel values, reserved/example/local/IP hosts, production
  NXQ hosts (including trailing-dot forms), non-HTTPS URLs, credentials, query
  strings, fragments, and the production Expo project ID regardless of UUID
  letter case;
- resolves to `com.gionyortiz.nxqsocial.staging` on iOS and Android, scheme
  `nxqsocial-staging`, and slug `nxq-social-mobile-staging`;
- uses fingerprint runtime policy with OTA checks disabled;
- disables push and routes policy/share/live web links through the configured
  staging web host rather than hard-coded production links.

The default `npm run build:android` and `npm run build:ios` scripts now target
only this locked profile. The legacy `preview` profile remains production-routed
and must not be substituted for staging.

The repository sentinel configuration was tested and failed closed as intended.
An ephemeral configuration using syntactically public-looking non-NXQ hostnames
and a dummy non-production UUID was then used only for local
config/export/prebuild checks. Those ephemeral values were not written to the
repository. The validator proves shape and exclusion rules only; it cannot
prove DNS reachability, resource ownership, or that a UUID belongs to a real
Expo project. Those remain manual gates before the profile can be unlocked.
The client-side guard covers configured API, web, and Turnstile entrypoints. It
does not prove that staging API redirects or response-derived media and LiveKit
URLs avoid production providers; staging backend/provider configuration and
redirect behavior must be audited during E2E.

## Additional migration repairs

- Password autofill hints are platform-specific so iOS no longer receives both
  `autoComplete` and `textContentType` on the same field. Registration retains
  separate password and confirm-password fields.
- LiveKit now starts and stops its native audio session with the room lifecycle,
  and enabled-native initialization failures are surfaced.
- Live photo upload verifies the upload HTTP status before calling the backend
  completion endpoint.

## Verification results

| Check | Result |
| --- | --- |
| `npm ci` | Passed |
| `npx expo install --check` | Passed; dependencies up to date |
| `npx expo-doctor@latest` | Passed, 21/21 |
| `npm run typecheck` | Passed |
| Production Expo config boundary | Passed: 1.0.7, production identifiers, `appVersion` runtime |
| Incomplete staging config | Passed: rejected before resolving |
| Staging negative cases | Passed: uppercase production UUID, trailing-dot production host, reserved example host, and IP host rejected |
| Ephemeral isolated staging config | Passed: separate native IDs, different UUID shape, OTA disabled, fingerprint runtime |
| EAS profile schema | Passed in independent EAS CLI 20 read-only review |
| Production Android JS export | Passed |
| Production iOS JS export | Passed |
| Isolated staging Android JS export | Passed after cache clear; SHA-256 differs from production |
| Production Android clean prebuild | Passed |
| Isolated staging Android clean prebuild | Passed; no production app ID in generated output |
| `git diff --check` | Passed |

Expo's Windows tooling does not generate an iOS native project, so iOS native
generation/build remains a macOS or EAS staging check. A local Android Gradle
compile was not possible because this host has no Java or Android SDK configured.
The candidate-created `mobile/android` and `mobile/dist/verification-*`
directories were removed. Pre-existing ignored outputs such as `mobile/dist`
and `mobile/.expo` were not deleted or treated as candidate artifacts.
The mobile package has no committed unit or E2E test suite, so no automated
mobile test count is claimed by this record.

Metro reused a production bundle when variants were switched once without a
cache clear. The staging export was therefore rerun with `--clear`; its bundle
SHA-256 (`ECF366371C50342954270EBAC62DC5EF95AC931027479F1A6BC1FF137A98C228`)
differs from production
(`BC1B8178896B1078D469C99B07C7B5D97B966067F0703B2D94346F9EE57B2F25`).
Future local cross-variant export checks must clear Metro's cache. Fresh EAS
workers do not reuse this local cache.

## Dependency audit

`npm audit` reports 13 moderate findings in the full tree and 11 moderate
findings in production dependencies, with zero high or critical findings. The
suggested automated remedies include incompatible major downgrades of Expo or
its modules, so no `npm audit fix` or force-fix was applied.

## Remaining release gates

1. Independent review of the uncommitted diff and lockfile.
2. Real Railway staging frontend/API/Turnstile URLs.
3. A separate Expo staging project ID and reviewed unlock of `staging-native`.
4. Native Android and iOS staging builds.
5. Physical-device registration, password/autofill, Turnstile, email
   verification, media, LiveKit audio/video/interruption, notifications, and
   restart testing.
6. Verify staging API redirects and response-derived media/LiveKit URLs remain
   on isolated staging providers.
7. Backup/restore and full Railway staging E2E completion before any DNS or
   store discussion.

Until those gates pass, this candidate is not a final mobile-release verdict
and must not be published by OTA or submitted to either store.
