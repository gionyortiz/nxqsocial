# NXQ Social Railway staging IaC

[`railway.ts`](./railway.ts) is the single project-level definition for the
existing `nxq-social-staging` Railway project and its `staging` environment.
It preserves the existing Postgres, Redis, and volume resources and proposes
the `backend` and `frontend` services from
`release/railway-staging-20260823`.

The configuration intentionally contains no custom domains, provider secrets,
production resources, or deployment authorization. The backend provider
preflight is a fail-closed pre-deploy command; future deployments cannot pass
until the separately managed staging credentials are complete.

A remote revision of `release/railway-staging-20260823` is **not eligible for
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
equals the remote staging branch, refuses missing or placeholder shared
variables, and reruns the exact `2 add, 0 change, 0 destroy` plan before
invoking a non-destructive apply:

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
confirm only after that final displayed plan is still exactly two service
additions with no other changes.

The offline CI check executes `npm --prefix .railway run validate`. That parses
and evaluates the TypeScript definition with the exact approved context,
asserts its resource inventory, and proves that missing or incorrect target
identities fail closed without authentication or network access.

The expected pre-apply plan is:

```text
Plan: 2 to add, 0 to change, 0 to destroy
  + Create service backend
  + Create service frontend
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
- `REKOGNITION_REGION`
- `REKOGNITION_ACCESS_KEY_ID`
- `REKOGNITION_SECRET_ACCESS_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

The public staging origins, exact NXQSocial R2 account endpoint, staging bucket
identities, Turnstile hostname, feature flags, and R2 region are non-secret and
remain pinned in the IaC definition. Never substitute production provider
credentials for missing staging variables.

## Migration notes

- The legacy `backend/railway.json` and `frontend/railway.json` files were
  removed because Railway does not allow one service to be managed by both the
  deprecated Config-as-Code system and project-level IaC.
- Railway's importer represented the custom Postgres service with the generic
  `postgres()` helper, which planned an unintended Postgres 16 to 18 image
  change. The checked-in definition uses `database()` with the exact imported
  `ghcr.io/railwayapp-templates/postgres-ssl:16` image instead.
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
