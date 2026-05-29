# NXQ Social � Deployment Guide

> **Target environment:** Docker Compose on a single VPS (e.g., Hetzner CX21, DigitalOcean Droplet, AWS EC2).  
> Adapting to Kubernetes or managed PaaS is straightforward � the Docker images are self-contained.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Docker | 24.x |
| Docker Compose | v2.20 |
| Node.js (CI / local build only) | 20.x |
| PostgreSQL (external, optional) | 16.x |
| Redis (external, optional) | 7.x |

---

## 1. Clone the Repository

```bash
git clone https://github.com/your-org/nexaquantum-chat.git
cd nexaquantum-chat
```

---

## 2. Configure Environment Variables

### Backend

```bash
cp backend/.env.example backend/.env.prod
nano backend/.env.prod   # fill in all values � see comments in the file
```

Critical values to set before going live:

| Variable | What to set |
|----------|-------------|
| `DATABASE_URL` | Injected automatically from `POSTGRES_*` vars in docker-compose.prod.yml |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `REDIS_URL` | Injected automatically |
| `FRONTEND_URL` | Comma-separated allowed origins: `https://nxqsocial.com,https://www.nxqsocial.com` |
| `STRIPE_SECRET_KEY` | From your Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | After configuring the webhook endpoint (step 7) |
| `AWS_*` / `S3_*` | From your AWS / Cloudflare R2 credentials |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Used by the seed script (step 5) |

### Frontend

```bash
cp frontend/.env.local.example frontend/.env.prod
nano frontend/.env.prod
```

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `https://api.nxqsocial.com/api` |
| `NEXT_PUBLIC_BETA_MODE` | `true` (set only during closed beta) |

### Root-level compose secrets

Create a `.env` file at the repo root (used by `docker-compose.prod.yml`):

```bash
cat > .env <<'EOF'
POSTGRES_USER=nxqsocial
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=nxqsocial
REDIS_PASSWORD=<strong-random-password>
NEXT_PUBLIC_API_URL=https://api.nxqsocial.com/api
NEXT_PUBLIC_BETA_MODE=false
EOF
```

---

## 3. Build and Start Services

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

The first build takes 3�5 minutes. Subsequent builds are faster due to layer caching.

Check that all containers are healthy:

```bash
docker compose -f docker-compose.prod.yml ps
```

Expected output: all four services (`postgres`, `redis`, `backend`, `frontend`) show **healthy** or **running**.

---

## 4. Run Database Migrations

Migrations run automatically when the backend container starts (`npx prisma migrate deploy` in the CMD).

To verify:

```bash
docker compose -f docker-compose.prod.yml logs backend | grep "All migrations"
```

---

## 5. Seed the Admin Account

Run **once** after the first deploy:

```bash
docker compose -f docker-compose.prod.yml exec backend npx prisma db seed
```

This creates the admin user using the `ADMIN_EMAIL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` values from `backend/.env.prod`.

> After seeding, log in at `https://yourdomain.com/login` and change the admin password immediately.

---

## 6. Configure a Reverse Proxy (Nginx example)

```nginx
# /etc/nginx/sites-available/NXQ Social
server {
    listen 80;
    server_name nxqsocial.com www.nxqsocial.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name nxqsocial.com www.nxqsocial.com;

    ssl_certificate     /etc/letsencrypt/live/nxqsocial.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nxqsocial.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 443 ssl http2;
    server_name api.nxqsocial.com;

    ssl_certificate     /etc/letsencrypt/live/api.nxqsocial.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.nxqsocial.com/privkey.pem;

    client_max_body_size 210M;  # allow video uploads

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Get a free SSL certificate with Certbot:

```bash
certbot --nginx -d nxqsocial.com -d www.nxqsocial.com -d api.nxqsocial.com
```

---

## 7. Configure Stripe Webhook

1. In the [Stripe Dashboard](https://dashboard.stripe.com/webhooks) → Add endpoint.
2. Endpoint URL: `https://api.nxqsocial.com/api/verification/stripe/webhook`
3. Events to listen for:
   - `identity.verification_session.verified`
   - `identity.verification_session.requires_input`
   - `identity.verification_session.canceled`
4. Copy the **Signing secret** → set `STRIPE_WEBHOOK_SECRET` in `backend/.env.prod`.
5. Restart backend: `docker compose -f docker-compose.prod.yml restart backend`

---

## 8. Configure S3 Bucket (AWS)

1. Create bucket `nxqsocial-media` in your chosen region.
2. Block all public access **except** for pre-signed URL reads, or attach a bucket policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{ "Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::nxqsocial-media/*" }]
   }
   ```
3. CORS configuration (allows presigned upload PUT from the frontend):
   ```json
   [{
     "AllowedHeaders": ["*"],
     "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
     "AllowedOrigins": ["https://nxqsocial.com", "https://www.nxqsocial.com"],
     "ExposeHeaders": ["ETag"]
   }]
   ```
4. Create an IAM user with `AmazonS3FullAccess` + `AmazonRekognitionFullAccess` policies.
5. Add the credentials to `backend/.env.prod`.

---

## 9. Health Check

```bash
# Liveness — always returns 200 if the process is up
curl https://api.nxqsocial.com/api/health
# {"status":"ok","timestamp":"...","uptime":42,"version":"1.0.0"}

# Readiness — returns 200 only if DB and Redis are reachable
curl https://api.nxqsocial.com/api/health/ready
# {"status":"ok","db":"ok","redis":"ok"}
# Returns 503 if either dependency is down
```

---

## 10. First Login

1. Navigate to `https://nxqsocial.com/login`
2. Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.
3. Change your password.
4. Go to `/admin/media` to access the media moderation dashboard.

---

## Updating the App

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build --no-deps backend frontend
```

Migrations run automatically on backend restart.

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Backend container exits immediately | `docker compose -f docker-compose.prod.yml logs backend` � usually a missing env var or migration failure |
| Frontend shows blank page | Check `NEXT_PUBLIC_API_URL` is correct and reachable |
| Stripe webhook returns 400 | Ensure `STRIPE_WEBHOOK_SECRET` matches the Stripe dashboard signing secret |
| S3 upload fails with CORS error | Re-check the bucket CORS configuration � origins must match exactly |
| Admin login returns 403 | Run the seed script (step 5) to ensure the admin user has `role: ADMIN` |

---

## Monitoring (optional)

For production observability consider:

- **Uptime monitoring:** Better Uptime, UptimeRobot (ping `/api/health`)
- **Error tracking:** Sentry (add `@sentry/nestjs` + `@sentry/nextjs`)
- **Metrics:** Prometheus + Grafana (add `@willsoto/nestjs-prometheus`)
- **Log aggregation:** Axiom, Logtail, or self-hosted Loki
