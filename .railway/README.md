# NXQ Social Railway staging IaC

[`railway.ts`](./railway.ts) is the single project-level definition for the
existing `nxq-social-staging` Railway project and its `staging` environment.
It preserves the existing Postgres, Redis, and volume resources and proposes
the `backend`, `frontend`, and one-shot `migration-job` services from
`release/railway-staging-20260916`.

The configuration intentionally contains no custom domains, provider secrets,
production resources, or deployment authorization. The backend pre-deploy
sequence is fail-closed: provider configuration must validate and the
restricted runtime role must verify the committed Prisma migration set before
an API deployment can become healthy.

A remote revision of `release/railway-staging-20260916` is **not eligible for
an IaC apply** unless one reviewed atomic commit contains all of the following
and has been pushed to that branch together:

- this complete `.railway/` definition and its lockfile;
- the backend provider-preflight implementation, executable entrypoint, and
  tests; and
- the CI workflows/checks required by both GitHub service sources.

Do not apply from a working tree, split these files across commits, or point
Railway at a branch whose remote tip does not contain the whole reviewed batch.

## Preview safely

Node.js 22 or newer is required. Install the IaC SDK from the lockfile:

```bash
npm ci --prefix .railway
```

Download the official prebuilt Railway CLI 5.43.3 binary from the
[Railway CLI v5.43.3 release](https://github.com/railwayapp/cli/releases/tag/v5.43.3)
and keep it outside this repository. Either place that binary on `PATH`, or
provide its absolute path. For example, on Windows PowerShell:

```powershell
$env:RAILWAY_CLI_PATH = 'C:\Tools\Railway\railway.exe'
& $env:RAILWAY_CLI_PATH --version
npm --prefix .railway run plan:verbose
```

The version command must print exactly `railway 5.43.3`. The plan wrapper
accepts only that exact external version and either no plan flag or the
non-secret `--verbose` flag. It invokes only `railway config plan` and points
the SDK at the already verified executable. Before planning, it hard-verifies
the linked project and environment IDs, then injects those non-secret
identities into the IaC evaluation. The definition rejects missing or
mismatched identities even when invoked directly. The wrapper rejects
value-decryption/display flags, never prints status JSON, and never calls
`railway config apply`.

After every required staging shared variable exists and the reviewed commit is
clean, pushed, and green in CI, the separate apply wrapper performs the same
exact target and CLI checks again. It additionally proves the local commit
equals the remote staging branch, refuses missing shared variables (including
sealed values), and reruns the exact `3 add, 0 change, 0 destroy` plan before
opening Railway's interactive resource apply:

```powershell
$env:RAILWAY_CLI_PATH = 'C:\Tools\Railway\v5.43.3\railway.exe'
npm --prefix .railway run apply
```

The apply wrapper accepts no arguments and never enables variable decryption,
value display, destructive confirmation, or non-interactive approval. It
requires the GitHub CLI to confirm the exact pushed commit's `CI` workflow
succeeded, and passes only a minimal operating-system environment to every
child process so unrelated provider credentials are not inherited. The release
preflight also does not auto-load repository `.env` files. It rechecks the
target immediately before opening Railway's own interactive apply prompt;
confirm only after that final displayed plan is still exactly three service
additions with no other changes. Railway can schedule independent services in
parallel, so service creation itself is not evidence of schema order: the API
has a read-only pre-deploy migration-status gate and cannot become healthy
until the migration job has completed successfully. After that job exits,
redeploy backend/frontend and require the schema gate to pass.

The offline CI check executes `npm --prefix .railway run validate`. That parses
and evaluates the TypeScript definition with the exact approved context,
asserts its resource inventory, and proves that missing or incorrect target
identities fail closed without authentication or network access.

The expected pre-apply plan is:

```text
Plan: 3 to add, 0 to change, 0 to destroy
  + Create service backend
  + Create service frontend
  + Create service migration-job
```

Do not apply if the plan contains a database or volume change, a domain, a
deletion, or any resource outside this staging project. Applying this plan,
adding credentials, assigning domains, or deploying services all require a
separate authorization and operational review.

## Required staging shared variables

The application services reference provider values through Railway shared
variables so no credential is stored in this repository or in the IaC plan.
The following shared-variable names must all exist before an apply:

- `JWT_SECRET`
- `OTP_PEPPER`
- `TURNSTILE_SECRET_KEY`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `STAGING_EMAIL_RECIPIENT_ALLOWLIST`
- `STAGING_PHONE_RECIPIENT_ALLOWLIST`
- `STAGING_PUSH_TOKEN_ALLOWLIST`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `CLOUDFLARE_PROXY_CIDRS`
- `RUNTIME_DATABASE_URL`
- `MIGRATION_DATABASE_URL`

`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are the standard S3-compatible
environment names consumed by the SDK, but in this staging definition they are
scoped Cloudflare R2 credentials. They do not authorize or require an AWS
account. Staging moderation is pinned to the non-secret `staging-mock` provider;
no Rekognition, AWS S3 bucket, or IAM credential is used.

The wrapper treats a sealed Railway variable as present without reading its
value. It runs only synthetic, structurally valid fixtures locally; exact
secret validation happens inside the staged service preflight. This keeps real
provider credentials out of local child processes and supports sealed Railway
variables.

The public staging origins, exact NXQSocial R2 account endpoint, staging bucket
identities, Turnstile hostname, feature flags, and R2 region are non-secret and
remain pinned in the IaC definition. Never substitute production provider
credentials for missing staging variables.

`CLOUDFLARE_PROXY_CIDRS` must be populated from Cloudflare's currently
published proxy ranges before a proxied staging deployment. It is required so
the backend can distinguish a Cloudflare edge request from an end user and
enforce per-client controls correctly. Do not hard-code a copied range list in
source or substitute a broad catch-all range; record the source and review date
with the staging release evidence.

## Database migration authority

Railway maps the separately provisioned `RUNTIME_DATABASE_URL` to the API's
`DATABASE_URL`; it must use the restricted `nxqsocial_runtime` PostgreSQL role,
not the Railway database service's default/owner connection. Railway makes a
service's variables available to both pre-deploy and runtime containers, so
this API never receives `MIGRATION_DATABASE_URL` and never performs schema
changes. `RUNTIME_DATABASE_ROLE` is fixed in source to
`nxqsocial_runtime`, so it cannot be self-attested as the migration role by a
Railway variable.

The separate `migration-job` service receives only
`MIGRATION_DATABASE_URL`, which must use the distinct
`nxqsocial_migrator` role. Its start command is
`npm run db:migrate:isolated`; it has no public domain, has no API runtime
credentials, and uses restart policy `NEVER`. The job fails closed if any
runtime/API credential or storage/provider configuration is present, or if its
URL username differs from its declared role. Its Prisma child receives only
the migration URL plus minimal operating-system context. Deploy it once,
observe a successful exit, then redeploy backend/frontend; their read-only
schema-status gate must pass before either API deployment is healthy.

This source/IaC boundary does **not** create PostgreSQL roles or grants. Before
any staging deployment, an operator must create and test the restricted runtime
role plus the separate migration role, verify their grants against the exact
staging database, grant the runtime role read-only access to
`_prisma_migrations` for the schema-status gate, and store both connection URLs
as sealed Railway shared variables. Do not treat a successful source test as
evidence that those provider-side controls exist.

## Migration notes

- The legacy `backend/railway.json` and `frontend/railway.json` files were
  removed because Railway does not allow one service to be managed by both the
  deprecated Config-as-Code system and project-level IaC.
- A read-only Railway dashboard inventory on 2026-09-16 confirmed that the
  retained staging service is actively running
  `ghcr.io/railwayapp-templates/postgres-ssl:18`. Older Postgres 16 entries
  are removed deployment history, not the current service state. The checked-in
  definition therefore pins the verified Postgres 18 image. Re-run the
  read-only plan before every apply; never infer the active database version
  from historical backup records.
- Railway IaC is currently beta. Re-run the plan after any CLI/SDK upgrade and
  review the complete diff before considering an apply.
- Railway CLI 5.43.3 is intentionally **not** an npm dependency here. Its npm
  package currently resolves `tar@6.2.1`, which npm audit flags with high and
  critical advisories. A forced `tar@7.5.22` override was rejected because the
  CLI installer uses tar v6's default-export API and cannot install with tar 7.
  Keeping the official prebuilt CLI outside this package leaves the committed
  IaC dependency graph audit-clean. Review a future official CLI release,
  update the exact version gate, and re-run both `npm audit` and the exact plan
  before changing this boundary.
