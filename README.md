# NXQ Social

A trust-first social platform for verified humans — safer feeds, creator-first media, and anti-bot protection.

> **Status: Private Beta** — invite-only access. Production deployment in progress.

## Release Status

Current Apple + Google Play release tracking lives in [docs/NXQ_SOCIAL_RELEASE_STATUS.md](docs/NXQ_SOCIAL_RELEASE_STATUS.md).

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT + configurable invite gate |
| File storage | AWS S3 signed uploads |
| Safety | Text scan + AWS Rekognition media scan |
| Verification | Stripe Identity + email/phone OTP |
| Moderation | Reports, audit logs, admin media review |

## Trust-First Features

NXQ Social is built around verified human identity from day one:

- **Configurable invite gating** — switch between closed beta and open registration via env flag
- **Email & phone OTP verification** — required before full access
- **Stripe Identity verification** — government ID check for verified badge
- **Trust score system** — progressive trust based on verification level
- **Anti-bot rate limits** — per-endpoint throttling
- **Content reports** — user-submitted reports with admin resolution
- **Admin media review** — manual approval queue for flagged uploads
- **Audit logs** — immutable record of moderation actions
- **AWS Rekognition media scan** — automatic safety scanning on upload
- **Moderation status pipeline** — `pending → scanning → approved/rejected`

## Private Beta Status

| Feature | Status |
|---|---|
| Registration + configurable invite gate | ✅ Live |
| Email / phone OTP | ✅ Live |
| JWT auth | ✅ Live |
| User profiles + follow/unfollow | ✅ Live |
| Photo & video uploads (S3) | ✅ Live |
| Media safety scanning (Rekognition) | ✅ Live |
| Infinite-scroll feed | ✅ Live |
| Vertical Reels | ✅ Live |
| Like & comment | ✅ Live |
| Stripe Identity verification | ✅ Live |
| Reports + admin moderation | ✅ Live |
| Audit log | ✅ Live |
| Admin media review | ✅ Live |
| Health checks (`/api/health/ready`) | ✅ Live |
| Direct messages | 🔜 Phase 2 |
| Stories | 🔜 Phase 2 |
| Creator analytics | 🔜 Phase 2 |
| Live streaming | 🔜 Phase 3 |
| Marketplace | 🔜 Phase 3 |
| Groups | 🔜 Phase 3 |
| Ads | 🔜 Phase 3 |
| Creator payouts | 🔜 Phase 3 |

## Quick Start (Local Development)

### 1. Start services

```bash
docker compose up -d
```

> Starts PostgreSQL on port 5432 and Redis on port 6379.

### 2. Backend setup

```bash
cd backend
cp .env.example .env      # fill required values
npm install
npx prisma migrate dev
npx prisma db seed        # creates admin user; set ADMIN_PASSWORD in production
npm run start:dev         # port 3000
```

### 3. Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev               # port 3001
```

Open [http://localhost:3001](http://localhost:3001)

## Production Deployment

See [DEPLOY.md](./DEPLOY.md) for the full production runbook covering:

- Docker Compose production stack
- Prisma migration (deploy, not reset)
- Cloudflare DNS setup
- Nginx + SSL (certbot)
- Stripe webhook configuration
- S3 CORS configuration
- Health check verification
- Smoke test script

## Core API Endpoints

### Auth & Registration
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | Optional or required (config) | Register user |
| POST | /api/auth/login | - | Login |
| GET | /api/auth/me | JWT | Current user |

### OTP Verification
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/otp/send-email | JWT | Send email OTP |
| POST | /api/otp/verify-email | JWT | Verify email OTP |
| POST | /api/otp/send-phone | JWT | Send phone OTP |
| POST | /api/otp/verify-phone | JWT | Verify phone OTP |

### Identity Verification
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/verification/start-identity-check | JWT | Start Stripe Identity |
| POST | /api/verification/stripe/webhook | Stripe sig | Stripe webhook |

### Media Uploads
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/media/create-upload-url | JWT | Get S3 signed URL |
| POST | /api/media/complete-upload | JWT | Confirm upload complete |
| GET | /api/media/:id/status | JWT | Poll safety scan status |

### Posts & Feed
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/posts/feed | JWT | Home feed |
| GET | /api/posts/reels | JWT | Vertical reels |
| POST | /api/posts | JWT | Create post |
| DELETE | /api/posts/:id | JWT | Delete post |
| POST | /api/posts/:id/likes | JWT | Toggle like |
| GET | /api/posts/:id/comments | JWT | Get comments |
| POST | /api/posts/:id/comments | JWT | Add comment |

### Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/users/:username | JWT | Get profile |
| PUT | /api/users/me/profile | JWT | Update profile |
| PATCH | /api/users/me/avatar | JWT | Upload avatar |
| POST | /api/users/:username/follow | JWT | Toggle follow |
| GET | /api/users/search?q= | - | Search users |

### Reports & Moderation
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/reports | JWT | Submit report |
| GET | /api/admin/media | Admin JWT | Media review queue |
| PATCH | /api/admin/media/:id | Admin JWT | Approve/reject media |

### Health
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /api/health | - | Liveness check |
| GET | /api/health/ready | - | Readiness (DB + Redis) |

## Environment Variables

### backend/.env (local dev)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nxqsocial
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
REDIS_URL=redis://localhost:6379
```

See `backend/.env.example` for the full production variable list.

### frontend/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

See `frontend/.env.local.example` for the full list.

## Phase 2 Roadmap

- Direct messages (WebSockets)
- Stories (24h expiry)
- Push notifications
- Creator dashboard & analytics
- AI content recommendations

## Phase 3 Roadmap

- Live video streaming
- Marketplace
- Groups
- Ads system
- Creator subscriptions & tipping & payouts
