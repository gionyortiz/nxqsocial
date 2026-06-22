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
- Register (with invite code field)
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

Open on device:

- iPhone: Expo Go + QR code
- Android: Expo Go + QR code

## Build Real App Binaries (APK/IPA)

This project is configured to produce installable mobile apps (not just Expo Go previews).

1. Install EAS CLI:

```bash
npm install -g eas-cli
```

2. Login to Expo account:

```bash
eas login
```

3. Build internal test binaries:

```bash
cd mobile
npm run build:android
npm run build:ios
```

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

## Next recommended steps

1. Integrate `@livekit/react-native` room UI into `app/calls.tsx`.
2. Add token registration + APNs/FCM flow in `app/push.tsx`.
3. Add stronger media format validation before upload (MP4/H.264 guidance in picker flow).
4. Add production auth hardening (refresh token + secure storage).
