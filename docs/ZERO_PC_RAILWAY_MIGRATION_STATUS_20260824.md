# NXQ Social zero-PC Railway migration status — 2026-08-24

## Locked outcome

NXQ Social production must continue operating when the home Windows computer,
Docker Desktop, WSL2, and the local Cloudflare Tunnel are all offline. The
permanent layout is Cloudflare DNS in front of Railway frontend/backend,
Railway PostgreSQL and Redis, R2 plus private AWS moderation storage, LiveKit
Cloud, Resend, Stripe, and Turnstile.

Windows remains development and rollback only. It must not be removed until a
separately authorized production cutover has remained stable for at least 14
days.

## Verified current state

- Source branch: `release/railway-staging-20260823`; clean base before this
  batch: `51e5e943b769b15041ac9cf34f1d1b2824f4b522`.
- Railway project `nxq-social-staging` has an empty `production` environment.
- Its `staging` environment contains only preserved PostgreSQL 16 and Redis
  8.2 service definitions and 5 GB volumes. Both deployments are removed and
  offline. There are no application services or public/custom domains.
- The project-level `.railway/railway.ts` plan is exactly two additions
  (`backend`, `frontend`), zero changes, and zero destroys. It preserves the
  database, Redis, images, volumes, and regions and defines no domain or
  provider secret.
- The plan wrapper fails closed unless it proves the exact Railway project and
  staging environment. It does not apply changes.
- GitHub CI covers backend build/unit/E2E, frontend test/build, operational
  script safety, and offline IaC structure. Railway sources are configured to
  wait for check suites.
- Provider preflight runs before migrations and requires exact staging
  resource identities. Synthetic fixture seeding requires exact Railway IDs
  and an approved database URL SHA-256. Restore evidence uses one read-only
  repeatable-read snapshot, the source backup SHA-256, and keyed per-table
  content HMACs without emitting rows or PII.
- The current Windows site remains rollback production; this code batch does
  not change DNS, start Railway, publish mobile builds, or delete local data.

## Budget snapshot and controls

The fresh Railway CLI usage check for the billing period beginning 2026-08-24
reported approximately `$0.1205` workspace usage, `$1.4419` estimated workspace
bill, and `$0.0009` attributed to `nxq-social-staging`. No workspace compute
limit is set because the workspace is shared with unrelated projects.

The existing NXQ-only authorization remains `$15/month`, with a manual stop at
`$12` to retain a `$3` margin. This does not authorize separately billed R2,
AWS, Resend, Stripe, LiveKit, Expo, or production Railway work.

## Provider blockers

The isolated staging provider set does not exist yet:

- R2 has only the existing NXQ media bucket; the required
  `nxqsocial-staging-public` and `nxqsocial-staging-quarantine` buckets and
  bucket-scoped token are absent.
- Turnstile has only the production signup widget; no widget restricted to
  `staging.nxqsocial.com` exists.
- AWS Rekognition plus private staging moderation bucket, Resend staging key
  and sender, Stripe test endpoint/secret, and a staging LiveKit project are
  absent.
- No ACL-restricted staging credential bundle exists. Ignored repository env
  files have broader inherited permissions and are not an approved secret
  store.

Production credentials must not be reused. Offline shape checks cannot prove
provider ownership or token scope; authenticated read-only provider identity
checks and real smoke tests are still required.

## Dependency audit exceptions

- The committed Railway IaC graph and full frontend dependency graph audit
  clean after non-breaking lockfile refreshes. The backend reports one
  high-severity advisory cascade through
  `prisma` / `@prisma/config` / `deepmerge-ts`. Prisma 7.9.1 still pins the
  affected transitive version and has no released non-breaking fix. The known
  call site reads the developer-controlled Prisma config, not request data.
  Track the pending upstream fix and upgrade `prisma` plus `@prisma/client`
  together; do not accept npm's forced downgrade to Prisma 6.
- Expo SDK 57 reports one moderate UUID advisory cascade through native `xcode`
  build tooling. The affected buffered UUID APIs are not used by that tool,
  and the upstream replacement has merged but is not published. Wait for the
  Expo-compatible release and re-run Expo Doctor, clean prebuild, and native
  device tests; do not force-downgrade Expo.

These exceptions do not authorize a Railway deploy or mobile build and must be
rechecked before either release boundary.

## Remaining authorized sequence

1. Require GitHub CI to pass on the exact atomically pushed staging-preparation
   revision. Any subsequent staging-code change must be pushed and rechecked
   before it can be considered for deployment.
2. Obtain explicit non-Railway provider budgets and authenticated staging
   access. Create the isolated provider resources and store secrets directly
   in Railway or an ACL-restricted file outside the repository.
3. Rerun the exact Railway plan. Apply only if it remains two additions, zero
   changes, and zero destroys.
4. Start PostgreSQL and Redis only for a bounded test window; deploy backend
   and frontend without public production DNS; apply all migrations and seed
   only the guarded synthetic fixtures.
5. Complete provider identity probes, registration/email/Turnstile, media,
   moderation/transcoding, LiveKit, Stripe-test, restart, CI, monitoring, and
   two restore-evidence rehearsals.
6. Stop staging after the test window and record spend and evidence.
7. Prepare a separate production migration/cutover package. Production
   services, database/media copy, Cloudflare DNS cutover, and removal of the
   local tunnel each require explicit authorization after all gates pass.

Until step 5 passes in full, the correct verdict is **staging deployment
blocked; zero-PC production not yet achieved**.
