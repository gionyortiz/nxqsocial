# NXQ Social

A creator-first social platform — combining the best of Instagram, TikTok, and Facebook.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | JWT (access token, 7-day expiry) |
| File storage | Local disk (swap for S3 in production) |

## Phase 1 Features (MVP)

- Sign up / Login
- User profiles with follow/unfollow
- Photo & video post uploads
- Infinite-scroll feed (posts from followed users)
- TikTok-style vertical Reels page
- Like & comment on posts
- User search

## Quick Start

### 1. Start the database

```bash
docker-compose up -d
```

> Requires Docker Desktop. Starts PostgreSQL on port 5432.

### 2. Run backend migrations

```bash
cd backend
npx prisma migrate dev --name init
```

### 3. Start backend (port 3000)

```bash
cd backend
npm run start:dev
```

### 4. Start frontend (port 3001)

```bash
cd frontend
npm run dev -- --port 3001
```

Open [http://localhost:3001](http://localhost:3001)

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | - | Register |
| POST | /api/auth/login | - | Login |
| GET | /api/posts/feed | JWT | Home feed |
| GET | /api/posts/reels | JWT | Short videos |
| POST | /api/posts | JWT | Upload post |
| DELETE | /api/posts/:id | JWT | Delete post |
| POST | /api/posts/:id/likes | JWT | Toggle like |
| GET | /api/posts/:id/comments | JWT | Get comments |
| POST | /api/posts/:id/comments | JWT | Add comment |
| GET | /api/users/:username | JWT | Get profile |
| PUT | /api/users/me/profile | JWT | Update profile |
| PATCH | /api/users/me/avatar | JWT | Upload avatar |
| POST | /api/users/:username/follow | JWT | Toggle follow |
| GET | /api/users/search?q= | - | Search users |

## Environment Variables

### backend/.env
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/NXQ Social
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=7d
```

### frontend/.env.local
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api
```

## Phase 2 Roadmap

- Direct messages (WebSockets)
- Stories (24h expiry)
- Notifications
- Creator dashboard / analytics
- AI content recommendations

## Phase 3 Roadmap

- Live video streaming
- Marketplace
- Groups
- Ads system
- Subscriptions & tipping
