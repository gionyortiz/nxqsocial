# NXQ Social Mobile

React Native + Expo mobile app for NXQ Social.

## Release Status

Cross-platform Apple + Google Play release tracking is maintained in [docs/NXQ_SOCIAL_RELEASE_STATUS.md](../docs/NXQ_SOCIAL_RELEASE_STATUS.md).

## Stack

- React Native
- Expo Router
- TypeScript
- Existing NXQ backend API: `https://api.nxqsocial.com/api`

## Implemented v1 screens

- Login
- Register (matching password confirmation, required terms consent, Turnstile,
  and required email verification)
- Feed
- Reels
- Create post (native photo/video picker)
- Profile
- Feedback
- Calls (LiveKit config + placeholder entry)
- Push notification structure placeholder

## Project location

- `mobile/`

## Run

```bash
cd mobile
npm install
npm run start
```

Expo Go can be used only as a limited JavaScript-screen preview. It is not a
valid test environment for this candidate's native LiveKit/WebRTC plugins.
Native registration, password/autofill, Turnstile, and LiveKit verification
must use a separately authorized development or internal staging build.

## Build Real App Binaries (APK/IPA)

This project is configured to produce installable mobile apps (not just Expo Go previews).

The SDK 57 migration is currently code-only. Do not run an EAS build, update,
submission, or channel command until the native-release gate in
`docs/NXQ_SOCIAL_RELEASE_STATUS.md` is explicitly cleared.

1. Install EAS CLI:

```bash
npm install -g eas-cli
```

2. Login to Expo account:

```bash
eas login
```

3. After the locked `staging-native` profile has been reviewed and supplied
   with real staging resources, build internal staging binaries:

```bash
cd mobile
npm run build:android
npm run build:ios
```

These scripts target only `staging-native` and currently fail closed. Do not
substitute the legacy `preview` profile: it routes to production API/Turnstile
hosts and has an Expo Update channel on the production project.

4. Build production binaries for stores:

```bash
cd mobile
npm run build:prod:android
npm run build:prod:ios
```

Configured identifiers:

- iOS bundle ID: `com.gionyortiz.nxqsocial`
- Android package: `com.gionyortiz.nxqsocial`

## Notes

- This app reuses the existing NXQ backend.
- No new backend was created.
- Web app and backend remain separate from mobile runtime.
- The new Turnstile flow adds the native `react-native-webview` module, which
  is absent from the identified 1.0.6 store binary. It cannot be published as
  an OTA-only update; it needs a new native build and device review.
- The source candidate now targets Expo 57.0.16, React Native 0.86.2, and app
  runtime 1.0.7. Expo Doctor, TypeScript, native JavaScript exports, and local
  Android prebuild checks pass. This removes the SDK 56 Hermes dependency
  blocker from the source tree but does not authorize a store build.
- The `staging-native` EAS profile is deliberately fail-closed. It has separate
  app identifiers, no update channel, OTA and push disabled, and required-value
  sentinels. It refuses to resolve until real Railway staging URLs and a
  separate staging Expo project are supplied in a reviewed change.
- The complete code-only verification record is in
  `docs/MOBILE_EXPO57_MIGRATION_VERIFICATION_20260823.md`.

## Next recommended steps

1. Independently review and commit the SDK 57 candidate diff.
2. Provision separate staging URLs and an Expo staging project, then unlock the
   `staging-native` profile in a reviewed commit.
3. Run native Android and iOS staging builds and physical-device registration,
   password/autofill, Turnstile, LiveKit, notification, and restart tests.
4. Add stronger media format validation before upload (MP4/H.264 guidance in picker flow).
5. Add production auth hardening (refresh token + secure storage).
