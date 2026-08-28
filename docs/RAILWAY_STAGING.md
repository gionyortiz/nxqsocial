# NXQ Social Railway staging runbook

This runbook authorizes preparation and validation of Railway **staging only**.
It does not authorize a Railway plan upgrade, production DNS change, App
Store/Expo release, production credential reuse, or deletion of the Windows
deployment. Keep Windows and its local uploads available for rollback for at
least 14 days after any separately authorized cutover.

The rollback helper `scripts/ensure-windows-runtime.ps1` starts Docker Desktop,
checks the named **NXQ Social Cloudflare Tunnel** scheduled task directly, and
waits for backend readiness plus frontend `/health` (falling back to `/` for
the retained pre-health-route Windows image). It is a bounded startup check,
not proof that Cloudflare can reach the host: after using it, verify
`https://nxqsocial.com` and the public API from an independent network before
declaring a 1033/523 incident recovered.

Do not leave a remotely managed Cloudflare tunnel token in the scheduled-task
command line. Configure `cloudflared` with `--token-file` and restrict that
file's ACL to the task principal plus the minimum recovery principals. This is
local containment only: if a token was exposed, rotate it in Cloudflare and
force-disconnect the old connectors as documented in Cloudflare's
[compromised-token procedure](https://developers.cloudflare.com/tunnel/advanced/tunnel-tokens/#rotate-a-compromised-token).

## Stop conditions

Do not create or expose staging until all of the following are true:

- the source is a reviewed, clean commit containing backend, frontend, Prisma
  migrations, Dockerfiles, scripts, and lockfiles together;
- backend tests, frontend tests/build, Prisma generation, and both Docker builds
  pass from that commit;
- the media migration dry run reports no missing files and the post-migration
  `--require-zero` gate is reproducible;
- the current media lifecycle tests pass, including quarantine, moderation,
  transcode recovery, attachment races, deletion, and object cleanup;
- a verified PostgreSQL backup, checksum, restore instructions, source commit,
  and rollback owner are recorded;
- projected Railway staging usage fits the authorized monthly ceiling.

A passing deploy healthcheck is not a release verdict. It does not prove object
storage, email, Turnstile, LiveKit, Stripe, or media moderation works.

## Isolation rules

Railway-generated frontend and backend domains are public internet endpoints.
Do not describe them as private and do not attach an unsanitized production
restore to them.

Use one of these reviewed patterns:

1. Preferred for a restored dataset: restore and verify the backup while the
   backend has **no public domain**, sanitize the application copy, then expose
   staging-only custom hostnames behind Cloudflare Access. Remove the generated
   Railway domains so they cannot bypass Access. Give automation an Access
   service token; do not create a broad public bypass.
2. If native-client testing cannot work through Access, use synthetic or fully
   sanitized data on the public staging API. Never expose production password
   hashes, contact data, provider references, push tokens, or private content.

Use staging-only resources and credentials throughout:

- a fresh Railway PostgreSQL service; never point staging at production;
- a fresh Railway Redis service; do not restore production Redis keys, OTPs,
  throttles, locks, queues, sessions, or push-token state;
- separate R2 public and quarantine buckets, a staging media hostname, and an
  R2 token scoped only to those staging buckets;
- a separate private AWS moderation bucket/prefix and least-privilege IAM
  credentials for Rekognition;
- Stripe test mode, a staging LiveKit project, staging Turnstile hostnames, and
  sandbox/allowlisted email, SMS, and push delivery.

Do not send verification email, SMS, push notifications, payment events, or
LiveKit invitations to restored production users. If an audited sanitizer and
outbound sink are not ready, use synthetic data instead.

## Service layout

Create four services in one Railway staging environment:

| Service    | Source/root                     | Public exposure                                          | Deployment check                    |
| ---------- | ------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| `backend`  | GitHub, `/backend`, Dockerfile  | Access-gated custom domain or sanitized-data test domain | `/api/health/ready`                 |
| `frontend` | GitHub, `/frontend`, Dockerfile | Access-gated custom domain                               | `/health`                           |
| PostgreSQL | Railway PostgreSQL              | none                                                     | offline restore + backend readiness |
| Redis      | Railway Redis                   | none                                                     | backend readiness                   |

Use Railway private networking for PostgreSQL and Redis. Do not define a fixed
Railway `PORT`; Railway injects it. The web containers bind to `0.0.0.0`.

## Repository deployment configuration

Railway's legacy per-service `railway.json` / `railway.toml` Config as Code is
deprecated and new services cannot opt into it. NXQ Social therefore uses the
project-level Infrastructure-as-Code definition at `.railway/railway.ts`.

Before any apply:

1. Commit and push the IaC definition, provider preflight, CI workflow, tests,
   and deletion of both legacy `railway.json` files atomically on the reviewed
   release branch.
2. Run `npm ci --prefix .railway` and `npm --prefix .railway run plan:verbose`
   with the pinned external Railway CLI described in `.railway/README.md`.
3. Require the wrapper to confirm the exact `nxq-social-staging` project and
   `staging` environment. Stop if it cannot prove both identities.
4. Require the plan to be exactly `2 to add, 0 to change, 0 to destroy`, with
   only the `backend` and `frontend` services added. Any database, Redis,
   volume, domain, image, production resource, change, or deletion stops the
   rollout.
5. Keep Railway auto-deploy disabled while staging is stopped. A revision is
   not eligible for a separately authorized manual deployment until CI passes
   on that exact commit.

Planning is read-only. `railway config apply`, service creation, variable
injection, domains, and deployment remain separate operational actions.

## Backend deployment settings

- Root directory: `/backend`
- Builder: Dockerfile
- Runtime: Node 22 Alpine in both Docker stages. The pinned Prisma dependency
  graph requires Node 22; keep the build and runtime major aligned and do not
  downgrade to Node 20 without a clean install, migration, and startup smoke
  test.
- Pre-deploy command: `node dist/scripts/release-provider-preflight.js && npm run db:migrate:deploy`.
  Railway accepts one pre-deploy command; `&&` keeps provider preflight first
  and prevents migrations from starting if it fails.
- Start command: leave unset (`npm run start:prod` is the image command)
- Healthcheck path: `/api/health/ready`
- Healthcheck timeout: 300 seconds
- Project IaC source: `/.railway/railway.ts`
- Restart policy: Railway's default on-failure policy, capped at 5 retries
  (prevents an unbounded staging crash loop from consuming the authorized budget)
- Draining time: at least 20 seconds

The pre-deploy container has no persistent volume. Its only permitted sequence
is the offline, read-only provider/application-target preflight followed by
Prisma migrations; a preflight failure must prevent the migration command from
starting. Never run the local-media migration or video backfill as a pre-deploy
command. The Windows Compose deployment deliberately uses
`npm run start:with-migrations` for its existing single backend instance.

The project IaC pins the non-secret staging target and application origins and
uses Railway references for private database/Redis URLs:

```text
NODE_ENV=production
NXQ_RELEASE_TARGET=staging
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
FRONTEND_URL=https://staging.nxqsocial.com
APP_BASE_URL=https://staging.nxqsocial.com
API_BASE_URL=https://api-staging.nxqsocial.com/api
```

Create the following Railway shared variables without committing their values.
The IaC connects them to the appropriate backend or frontend service:

```text
JWT_SECRET
TURNSTILE_SECRET_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
OTP_PEPPER
RESEND_API_KEY
EMAIL_FROM
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
LIVEKIT_URL
LIVEKIT_API_KEY
LIVEKIT_API_SECRET

# Staging R2 object storage credentials
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY

# Separate AWS moderation account/bucket
REKOGNITION_REGION
REKOGNITION_ACCESS_KEY_ID
REKOGNITION_SECRET_ACCESS_KEY
```

The IaC sets `JWT_EXPIRES_IN`, `SIGNUP_HARDENING_ENABLED`,
`TURNSTILE_ALLOWED_HOSTNAMES`, `TURNSTILE_TEST_BYPASS`, the exact NXQSocial R2
account endpoint, the three staging bucket identities, `S3_PUBLIC_BASE_URL`,
`AWS_REGION`, and the frontend feature flags to reviewed non-secret values. It
binds `LIVEKIT_EXPECTED_STAGING_URL` to the same shared `LIVEKIT_URL` reference
so the backend preflight still requires an exact staging match without
duplicating a secret-store value. Direct Railway staging traffic leaves the
trusted-proxy override variables unset.

The application origins are not free-form staging inputs. They must remain this
single approved set; the release preflight rejects missing, alternate,
generated Railway, preview, or production values before any migration runs:

```text
FRONTEND_URL=https://staging.nxqsocial.com
APP_BASE_URL=https://staging.nxqsocial.com
API_BASE_URL=https://api-staging.nxqsocial.com/api
```

`FRONTEND_URL` must contain only that one origin in staging. Keep the `/api`
suffix on `API_BASE_URL`. These values pin application-generated links, CORS,
and media URLs to the same reviewed staging boundary; they do not create or
attach either hostname.

`S3_PUBLIC_BASE_URL` must be the staging public-media hostname. It must never be
the R2 API endpoint or production `media.nxqsocial.com`. The backend refuses to
boot if the public and quarantine buckets are equal or required production
moderation/storage settings are absent.

Keep optional provider groups either complete or absent. The full release gate
requires staging Stripe and LiveKit groups even though startup permits those
groups to be absent.

Do not persist `MIGRATE_LOCAL_MEDIA_CONFIRM`,
`MIGRATE_EXPECTED_DATABASE_URL_SHA256`, `MIGRATE_EXPECTED_BUCKET`,
`MIGRATE_EXPECTED_UPLOAD_ROOT`, `MIGRATE_EXPECTED_S3_ENDPOINT`,
`MIGRATE_EXPECTED_S3_ACCOUNT_ID`, `MIGRATE_EXPECTED_S3_PUBLIC_BASE_URL`,
`BACKFILL_TRANSCODE_MAINTENANCE`, or `BACKFILL_TRANSCODE_CONFIRM` on the web
service. Supply them only to the reviewed one-off command that needs them. The
database identity value is a SHA-256 digest only: derive it inside an approved
process that reads `DATABASE_URL` without echoing it, store only the
64-character hexadecimal digest, and never paste or log the database URL
itself.

## R2 and AWS moderation controls

Create two R2 buckets with different names:

- **public**: staging media custom domain; public clients read through that
  domain, while only the application token may write or delete managed keys;
- **quarantine**: private, no custom domain, no `r2.dev` public access; browser
  presigned PUTs and server reads/copies/deletes only.

Scope the R2 token to those two staging buckets. Quarantine CORS must name the
exact staging frontend origin and only the required method/header, for example:

```json
[
  {
    "AllowedOrigins": ["https://staging.nxqsocial.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

Do not apply this rule until the approved staging hostname is actually attached
and Access/synthetic-data exposure is ready. Use two exact-prefix lifecycle
rules on the quarantine bucket:

- expire client-writable `incoming/` objects after 1 day; the application first
  reclaims PENDING rows after the 10-minute presign plus a 60-minute slow-upload
  grace period (70 minutes total);
- retain server-owned `processing/media-finalizing/` immutable snapshots for at
  least 7 days so recovery and transcode retries cannot race storage expiry.

Configure exact-origin GET/HEAD CORS on the public media domain only if browser
fetch/canvas behavior requires it; do not make the quarantine bucket public to
solve a CORS error. Never add `processing/media-finalizing/` to a browser PUT
policy or presigned client-upload path.

The AWS moderation bucket is a third, separate bucket. It must be private,
block public access, reside in `REKOGNITION_REGION`, and have no public domain.
Scope IAM to the required Rekognition Detect/Start/Get actions and S3
Put/Get/Delete access only for the moderation prefix. Add a short lifecycle rule
for `nxq-social/` so a crashed worker cannot retain moderation copies forever.
Confirm the R2 public bucket, R2 quarantine bucket, and AWS moderation bucket
are all staging resources before the first upload test.

## Client IP and Cloudflare semantics

On Railway, the backend trusts Railway's documented immediate proxy network
only when Railway injects both runtime identity variables. It uses Railway's
`X-Real-IP`; it does not fall back to `X-Forwarded-For`.

For a Cloudflare-proxied custom hostname, set `CLOUDFLARE_PROXY_CIDRS` to
Cloudflare's current published IPv4 and IPv6 ranges. `CF-Connecting-IP` is used
only when Railway's `X-Real-IP` is inside one of those ranges. Never configure a
catch-all or broad private CIDR. Leave `TRUSTED_PROXY_IPS` and
`TRUSTED_PROXY_CIDRS` empty on Railway.

Cloudflare Access protects only the hostname routed through it. Remove the
generated Railway domain or it remains a direct bypass. Re-check this after each
domain or networking change. If Stripe test webhooks must cross Access, create a
narrow path-only exception for the signed webhook endpoint after verifying its
signature enforcement; never bypass Access for the whole API.

## Frontend deployment settings

- Root directory: `/frontend`
- Builder: Dockerfile
- Start command: leave unset (standalone Next.js image command)
- Healthcheck path: `/health`
- Healthcheck timeout: 300 seconds
- Project IaC source: `/.railway/railway.ts`
- Restart policy: Railway's default on-failure policy, capped at 5 retries
- Draining time: at least 20 seconds

The project IaC pins the first three non-secret build variables. Supply the
remaining staging-only values before the first build:

```text
NXQ_RELEASE_TARGET=staging
NEXT_PUBLIC_APP_URL=https://staging.nxqsocial.com
NEXT_PUBLIC_API_URL=https://api-staging.nxqsocial.com/api
NEXT_PUBLIC_TURNSTILE_SITE_KEY
NEXT_PUBLIC_CALLS_ENABLED=true
NEXT_PUBLIC_LIVE_ENABLED=true
```

The Docker build requires the explicit release target and rejects any app/API
pair other than the exact approved pair for that target, including a staging
build aimed at production. It also rejects a placeholder Turnstile site key.
`NEXT_PUBLIC_*` values are compiled into the browser bundle; rebuild after every
change. These values do not create domains. If calls or live are intentionally
disabled, record the verification result as partial rather than claiming the
full release gate passed.

## Restore and local-media migration

Perform the restore twice: once as an offline backup-integrity exercise and once
for the sanitized application staging copy.

1. Create private PostgreSQL and Redis services. Do not add web domains yet.
2. Record the source backup checksum, source commit, schema version, row-count
   manifest, local-upload inventory, and restore owner.
3. Restore into a fresh private database and run `npm run db:migrate:deploy`.
   Compare the integrity manifest. Delete nothing from Windows.
4. Create the application staging database from the verified restore, run the
   audited sanitizer, clear outbound/provider/token state, and create dedicated
   test accounts. If no sanitizer exists, use a synthetic database.
5. From a controlled one-off host that can read the retained Windows upload
   directory, point `DATABASE_URL` and storage variables at **staging only**.
   Build the backend, then run the migration dry inventory:

   ```text
   npm run build
   npm run migrate:local-media -- --upload-root=<absolute-retained-upload-root>
   ```

6. Require `missing=0`, review the target inventory, and confirm both staging
   R2 bucket identities. In that one controlled process, set every execution
   gate:
   - `MIGRATE_LOCAL_MEDIA_CONFIRM=UPLOAD_AND_UPDATE`;
   - `MIGRATE_EXPECTED_DATABASE_URL_SHA256` to the lowercase 64-character
     SHA-256 digest of the exact staging `DATABASE_URL` (hash only; never print
     or log the URL);
   - `MIGRATE_EXPECTED_BUCKET` to the exact staging public bucket;
   - `MIGRATE_EXPECTED_UPLOAD_ROOT` to the canonical absolute retained upload
     root passed to `--upload-root`;
   - `MIGRATE_EXPECTED_S3_ENDPOINT` to the canonical staging R2 API endpoint;
   - `MIGRATE_EXPECTED_S3_ACCOUNT_ID` to the exact staging R2 account ID
     derived from that endpoint; and
   - `MIGRATE_EXPECTED_S3_PUBLIC_BASE_URL` to the exact staging media origin,
     which must differ from the R2 API origin.

   Execute only after independently comparing those non-secret identities:

   ```text
   npm run migrate:local-media -- --execute --upload-root=<absolute-retained-upload-root>
   ```

   The script refuses a database hash, bucket, upload-root, endpoint/account, or
   public-base mismatch. Before its database compare-and-swap update, it reads
   the uploaded object back and verifies its size, content type, and SHA-256
   digest. A concurrent row change is skipped rather than overwritten. If a
   database response is ambiguous, the script rereads the row before deciding
   whether an uploaded object is safe to clean up.

7. Run `npm run migrate:local-media -- --require-zero` against the same staging
   database. Verify object counts, sizes, representative hashes/content, image
   display, video range/playback, thumbnails, avatars, and banners.
8. Restore the backup into a second fresh private database and repeat the
   integrity checks. A backup is not accepted until the second restore matches.

Do not run migration while users can mutate the target database. Do not delete
or unmount Windows uploads after migration; they are part of the 14-day rollback
set. The migration is not approved if it can confuse a remote CDN `/uploads/`
URL with a local file reference.

## Optional video backfill maintenance window

Do not run the video backfill during a normal deploy. First pass its dry run:

```text
npm run backfill:transcode-videos
```

To execute, stop every backend/API/worker replica, take a fresh database backup,
verify object-store recovery, set `BACKFILL_TRANSCODE_MAINTENANCE=true` and
`BACKFILL_TRANSCODE_CONFIRM=TRANSCODE_PUBLISHED_VIDEOS` for that one process,
then run:

```text
npm run backfill:transcode-videos -- --execute
```

Concurrency is fixed at one until video processing is stream-based. Restart the
backend only after the command exits, then require zero stuck TRANSCODING or
SCANNING rows and manually verify a sample of old videos. Any failure or newly
rejected previously published asset stops the release.

## End-to-end release gate

After storage/config smoke tests pass, expose only the sanitized/access-gated
staging services and verify all of the following on web. Mobile registration is
an explicit blocked lane under the current authorization: the store binary does
not contain the new native WebView dependency. The isolated `staging-native`
profile now exists, but it is deliberately locked behind required staging URLs,
a separate Expo project ID, and an explicit readiness gate; the default internal
build scripts target that locked profile. Do not substitute the legacy
production-routed `preview` profile, unlock or build `staging-native` before its
resources and build authorization exist, or call mobile E2E passed. An
authorized internal native build must pass the same checks before mobile can be
promoted.

- registration with password confirmation, Turnstile, email verification,
  resend/rate limits, login, logout, password reset, and bot-abuse controls;
- profile avatar/banner upload, replacement, deletion, and cleanup;
- image and video direct upload, quarantine isolation, moderation, transcode,
  thumbnail, publish, playback/range requests, rejection, retry, and deletion;
- post and story creation/deletion, story expiry cleanup, feed visibility, and
  concurrency/attachment tests;
- Redis-backed throttles, locks, jobs, and restart recovery;
- staging LiveKit calls and live rooms on web with both feature flags enabled;
- Stripe test Checkout/Identity/webhooks and failure/retry paths;
- email/SMS/push sinks proving no restored production recipient is contacted;
- `/api/health/ready` and `/health` during replacement deploy and rollback;
- a second restore test and a documented Windows rollback rehearsal.

Record evidence and exact failures. Do not reinterpret a disabled feature,
bypassed scanner, missing provider, or public staging endpoint as a pass.

## Budget controls

Before creating services, use Railway's estimator/current pricing and record the
expected database, Redis, frontend, backend, storage, egress, and build usage.
Review spend after each test window. Railway compute alerts and hard limits are
workspace-wide, not project-specific; do not set or change one merely for NXQ
staging because it can stop unrelated projects in the same workspace.

Do not assume serverless sleep will contain cost: the backend has periodic media
recovery work and may remain active. Manually stop staging web services after
the test window and verify no build/restart loop is consuming usage. Treat $12
of NXQ project estimated usage as the manual stop threshold, preserving a $3
margin below the authorized $15 monthly ceiling. Do not
upgrade to Pro or incur separately billed R2/AWS/LiveKit/Stripe resources without
separate authorization. If the estimate no longer fits the ceiling, stop before
provisioning or deployment.

## End of staging authorization

At the end of this runbook, document results and stop. Production Cloudflare DNS,
the App Store/Expo release, production Railway services, credential rotation,
and removal of the Windows deployment each require separate authorization.

Railway deployment healthchecks gate new deployments but are not continuous
monitoring. Configure an external uptime monitor before any future production
cutover.
