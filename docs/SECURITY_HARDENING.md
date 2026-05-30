# NXQ Social — Security Hardening Record

This document records the security controls implemented for NXQ Social and the
follow-up tasks required before a wider public launch. It reflects the verified
state of the codebase as of the latest deployment.

> Scope: backend (NestJS 11 + Prisma + PostgreSQL + Redis), frontend
> (Next.js 16), and production infrastructure (Hetzner VPS, Docker Compose).

---

## 1. Transport security (HTTPS / SSL)

- Nginx reverse proxy in front of the application containers.
- Let's Encrypt SSL certificates.
- HTTPS enabled for `nxqsocial.com` and `api.nxqsocial.com`.
- API served behind the `/api` global prefix.

---

## 2. Backend security baseline

- **Helmet** enabled (`app.use(helmet())`) for secure HTTP response headers.
- **Global `ValidationPipe`** with `{ whitelist: true, forbidNonWhitelisted: true }`
  — unknown/extra payload fields are stripped and rejected with `400`.
- **CORS** restricted via the `FRONTEND_URL` environment variable (no wildcard in
  production); only the configured origin(s) are allowed, with `credentials: true`.
- **Graceful shutdown** hooks enabled.
- **Health endpoints**:
  - `GET /api/health`
  - `GET /api/health/ready` → `{ "status": "ready", "checks": { "database": "ok", "redis": "ok" } }`

---

## 3. Password security

- **bcrypt (bcryptjs) hashing with cost factor 12.**
- No plaintext password is ever stored (verified by E2E test).
- Password-reset tokens are stored **hashed** (SHA-256), never in plaintext.
- Login returns a **generic error** (`Invalid credentials`) for both unknown
  email and wrong password — no user enumeration.
- **Timing-safe login**: a dummy `bcrypt.compare` runs against a constant hash
  when the email does not exist, so response timing cannot reveal whether an
  account exists.

---

## 4. Password policy (new & changed passwords only)

Applied to `RegisterDto`, `ResetPasswordDto`, and `ChangePasswordDto`.
Existing user passwords are **not** invalidated.

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

The frontend register, reset-password, and settings (change password) forms
mirror these rules to give users clear inline guidance.

---

## 5. Rate limiting

Implemented with `@nestjs/throttler`, scoped **per-route** (not a global guard)
so normal polling traffic is unaffected. Throttling is skipped under
`NODE_ENV=test` so the E2E suite can register/login freely.

| Endpoint | Limit |
| --- | --- |
| `POST /api/auth/login` | 5 / minute |
| `POST /api/auth/register` | 5 / 5 minutes |
| `POST /api/auth/forgot-password` | 3 / 10 minutes |
| `POST /api/auth/reset-password` | 5 / 10 minutes |
| `POST /api/media/create-upload-url` | 30 / hour |
| `POST /api/verification/request` | 10 / hour |
| `POST /api/verification/start-identity-check` | 5 / hour |
| comments / likes / follows | per-action anti-bot limits via `ActionRateLimitGuard` |

---

## 6. Authentication & authorization

- **JWT** authentication via `JwtAuthGuard`.
- **`AdminGuard`** enforces a database-backed `role === 'ADMIN'` check on admin
  endpoints.
- **Verification admin routes fixed** to require `JwtAuthGuard + AdminGuard`
  (previously protected by login only — see §13 history).
- Admin media routes protected (`@UseGuards(JwtAuthGuard, AdminGuard)`).
- Admin reports routes protected (`@UseGuards(AdminGuard)`).
- Admin user actions (list / suspend / restore / ban) protected
  (`@UseGuards(JwtAuthGuard, AdminGuard)`).

---

## 7. Broken Object Level Authorization (BOLA) / access control

Verified ownership checks and covered by `authorization.e2e-spec.ts`:

- Users cannot delete another user's post (`authorId !== userId` → `403`).
- Users cannot attach another user's media to a post
  (`asset.userId !== authorId` → `403`).
- Users cannot complete another user's upload
  (`asset.userId !== userId` → `403`).
- Normal users cannot access admin routes (verification, media, reports).
- Profile updates are scoped to the authenticated user only (`me/profile`).

---

## 8. Mass assignment / property-level authorization

- `UpdateProfileDto` whitelists only: `displayName`, `bio`, `location`, `website`.
- `forbidNonWhitelisted: true` rejects any extra fields with `400`.
- The profile update writes only to the `Profile` relation, which does not
  contain privileged columns.
- Protected fields cannot be set through profile updates:
  `role`, `trustScore`, `verificationStatus`, `emailVerified`, `phoneVerified`,
  `password`.
- Covered by a mass-assignment E2E test that asserts the database values are
  unchanged after an injection attempt.

---

## 9. Upload security

- Presigned **S3 PUT** uploads (client uploads directly to storage).
- **Random S3 object keys** (`uploads/{userId}/{uuid}{ext}`) — the original
  filename is never trusted.
- **MIME allowlist**:
  - Images: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
  - Video: `video/mp4`, `video/webm`, `video/quicktime`
- **Size limits**: images ≤ 10 MB, videos ≤ 200 MB.
- Disallowed types (SVG, HTML, JS, EXE, ZIP, etc.) are rejected by the allowlist.
- **Ownership check** on `complete-upload`.
- **AWS Rekognition** image/video moderation (when enabled) gates publishing.

> Follow-up: add magic-byte/content sniffing in addition to the declared MIME
> type for defense-in-depth (see §13).

---

## 10. Trust & safety

- Trust-score system with tiers: Human Verified / ID Verified / Business Verified.
- Reports system with admin review queue.
- Audit logs for sensitive admin actions.
- Admin media review pipeline.
- AI/text safety scanning and scam/link pattern detection on captions.
- **No `dangerouslySetInnerHTML`** anywhere in the frontend (React auto-escaping
  is relied upon) — removes a major XSS vector.

---

## 11. Secrets hygiene

- `.env`, `.env.prod`, `.env.staging`, `.env.local` are git-ignored.
- `password.txt` is git-ignored and was **never committed** to git history
  (verified via `git log --all -- password.txt`).
- No secret files are currently staged or tracked.
- **Recommended:** rotate any credentials that may have been shared outside the
  repo (including the beta invite code) before inviting beta users.

---

## 12. Testing completed

- Backend build passing (`npm run build`).
- Frontend build passing (`npm run build`).
- Unit tests passing (33/33).
- E2E suites added:
  - `auth-security.e2e-spec.ts` — weak-password rejection, invalid email,
    generic login errors, no-plaintext storage, hash verification, login rate
    limit.
  - `authorization.e2e-spec.ts` — BOLA, mass-assignment rejection, admin-route
    lockout for normal users.

> Note: DB-dependent E2E specs require a running PostgreSQL test database; they
> run in CI / on the server, not on a developer machine without Docker.

---

## 13. Known follow-up security tasks

- Rotate all potentially-exposed secrets (DB, Redis, admin, beta invite code).
- Scrub any leaked history if a real secret is ever found committed.
- Add a dependency audit report (`npm audit --omit=dev` for backend & frontend);
  current backend finding is 3 **moderate** advisories transitively via
  `@prisma/dev → @hono/node-server`, a dev-only tool not used in the production
  runtime (`prisma migrate deploy`). No critical/high.
- Enable **GitHub secret scanning** and **Dependabot**.
- Add magic-byte content sniffing for uploads.
- Finish avatar/banner profile-media security tests
  (`PATCH/DELETE me/avatar`, `PATCH/DELETE me/banner`).
- Review JWT **refresh-token** strategy (currently access-token-only;
  acceptable for early beta, consider HttpOnly/Secure/SameSite refresh cookies
  longer term).
- Add a published security contact: `security@nxqsocial.com`.

---

## Private Beta Security Status

**Status: Ready for limited private beta after secret rotation and smoke testing.**

The application has strong authentication, authorization, upload, and input
validation controls in place, with automated tests guarding the highest-risk
OWASP categories (Broken Access Control, BOLA, mass assignment, and auth safety).
Complete the secret rotation in §13 and a smoke test before inviting the first
10–25 beta users.
