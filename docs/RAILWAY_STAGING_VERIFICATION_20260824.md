# Railway staging verification record — 2026-08-24

## Scope and change boundary

- Authorized target: NXQ Social Railway **staging**, up to $15/month.
- Not authorized or performed: production DNS cutover, Railway Pro upgrade,
  App Store/Expo publication, Windows deployment deletion, or production data
  mutation.
- Railway project/services created so far: **none**.
- Source branch: `release/railway-staging-20260823`.
- Preserved production rollback: Windows Docker deployment and retained local
  uploads.

## Railway budget preflight

- Authenticated Railway workspace contained three unrelated projects before
  NXQ staging.
- Current billing-period usage at the preflight snapshot was $3.86.
- No workspace compute usage limit was configured.
- A workspace-wide hard limit was deliberately not changed because reaching it
  can stop unrelated projects. NXQ staging will use bounded service resources,
  an on-failure retry cap, active usage review, and shutdown outside test
  windows.
- Current Railway metering is $10/GB-month of actual RAM, $20/vCPU-month,
  $0.05/GB service egress, and $0.15/GB-month volume storage, billed by the
  minute. Four always-running services cannot be assumed to fit $15 without
  measured usage. The initial staging observation window is therefore bounded
  to seven days, with the NXQ project stopped at $12 estimated usage to retain
  a $3 safety margin. This is a manual project-level gate; no workspace-wide
  limit will be changed.

## Production backup and independent restore proof

- Source: read-only `pg_dump` from the Windows PostgreSQL 16 production
  container.
- Format: PostgreSQL custom archive, gzip compression, no owner or privileges.
- Archive path (outside the repository):
  `E:\NXQ-Social-Private-Backups\railway-staging\nxq-production-20260824.dump`
- Archive size: 73,176 bytes.
- SHA-256:
  `63F5B44060B69904F362AF8183C439B21023475475B3FB5E2D916EE3B5FF900C`
- Dumped database/server version: PostgreSQL 16.14.
- Restore target: fresh disposable PostgreSQL 16 Alpine container with tmpfs
  storage and no published port.
- Restore command completed with `--exit-on-error`.
- Exact source/restore manifest:

  | Check | Source | Restore |
  | --- | ---: | ---: |
  | Public tables | 27 | 27 |
  | Users | 13 | 13 |
  | Profiles | 13 | 13 |
  | Posts | 27 | 27 |
  | Media assets | 27 | 27 |
  | OTP rows | 0 | 0 |
  | Prisma migrations | 16 | 16 |

- Result: **MATCH**.
- The disposable restore container was removed after verification. The backup
  remains retained and its Windows ACL permits only the current user, SYSTEM,
  and Administrators. BitLocker encryption status was not verifiable without
  administrator access.

## Windows media rollback copy

- Live source verified: Docker volume `nexaquantumchat_backend_uploads` mounted
  at `/app/uploads`; the similarly named repository directory is not the live
  production source.
- The source volume was copied read-only to
  `E:\NXQ-Social-Private-Backups\railway-staging\production-uploads-20260824`.
- Copied files: 2; copied file bytes: 131,493.
- Source and copy per-object SHA-256 values match. Exact production object
  paths and hashes are retained only in the private backup evidence record,
  not in this repository.
- The rollback copy has the same restricted Windows ACL as the database dump.
- The live Docker volume and Windows deployment were not changed or deleted.

## Repository artifact boundary

- The candidate index tracks no `backend/uploads/**` files and no Android AAB;
  physical rollback files remain ignored and were not deleted.
- This removes artifacts from the new tip only. Existing Git history still
  contains 307 historical upload paths and one approximately 101.8 MB AAB blob.
  They have **not** been purged. If the repository will be shared more broadly,
  schedule a coordinated history rewrite and credential/privacy review outside
  this staging branch; do not force-rewrite the rollback branch during rollout.

## Verification results

This section is completed only from fresh final runs after all staging changes
stop moving.

| Lane | Result |
| --- | --- |
| Backend build | Passed |
| Backend unit tests | 27 suites / 206 tests passed |
| Backend E2E tests | 13 suites / 106 tests passed |
| Frontend tests | 9/9 passed |
| Frontend production build | Passed |
| Mobile TypeScript | Passed |
| Expo dependency compatibility | **Blocked:** Expo Doctor reports the SDK 56 Hermes V1 memory regression; SDK 57 / React Native 0.86.2+ is required before a mobile release |
| Android production bundle export | Passed |
| Backend Docker build/smoke | Passed: Node 22 image, fresh 17-migration PostgreSQL deploy, production-mode startup, `/api/health` |
| Frontend Docker build/smoke | Passed: production image and `/health` |
| Production local-media inventory | Passed read-only: 1 media asset, 0 profiles, missing=0, no upload or DB writes |
| Media durability re-audit | **Clean:** no HIGH/MEDIUM code-review blockers; 108/108 focused tests passed independently |
| Diff/artifact/secret gate | Passed for candidate tip: `git diff --check`, no tracked upload/AAB/env artifact, no high-confidence secret match |
| Windows watchdog syntax | Passed parser validation; execution/public-network recovery check remains operational evidence |

The Docker migration smoke applied all 17 migrations to a disposable
PostgreSQL 16 container. The production inventory mounted
`nexaquantumchat_backend_uploads` read-only and omitted `--execute`; it reported
`missing=0` and explicitly performed no uploads or database updates. A fresh
post-run read-only production check remained at 13 users, 27 posts, 27 media
assets, and 16 applied migrations.

The Windows watchdog remains a supervised rollback aid, not boot-level hosting:
its installed tasks require an interactive user login, and the helper validates
existing containers rather than recreating an absent Compose stack. Cold-reboot
recovery before login and an external-network rollback rehearsal remain pending.

Dependency review remains explicit rather than force-fixed: frontend production
dependencies report zero vulnerabilities; backend reports three high findings
in Prisma CLI/config's pinned `deepmerge-ts` chain, whose offered npm fix is a
breaking Prisma downgrade; mobile reports 11 moderate Expo/Xcode/UUID findings
whose offered force-fix is also breaking. Neither unsupported override was
applied.

The current mobile worktree adds native `react-native-webview` 13.16.1 for the
Turnstile registration flow. The latest identified iOS Store build (app/runtime
1.0.6, source commit `d65e5da`) did not contain that native module. Therefore
this registration update is **not eligible for an Expo OTA-only publication**
to that binary; a separately authorized native store build is required. No EAS
build or update was started during this staging work.

`mobile/app.json` reconciles the source version from the repository's stale
1.0.1 value to the already identified 1.0.6 binaries. It does not introduce a
1.0.7 version and did not trigger a build, OTA update, or store publication.

## Remaining gates before creating Railway services

- Prepare staging-only R2 public/quarantine storage, AWS moderation,
  Turnstile, mail sink, Stripe test, and LiveKit credentials. Production
  credentials and recipient data must not be reused.
- Push and review the isolated candidate commit; repeat the diff/secret gate on
  that exact commit before provisioning.
- Keep mobile publication blocked until the Hermes regression is removed and a
  native store build containing `react-native-webview` passes device testing.

No production cutover can be considered until the full end-to-end checklist in
`RAILWAY_STAGING.md` passes against staging and the separately required second
restore rehearsal also matches.
