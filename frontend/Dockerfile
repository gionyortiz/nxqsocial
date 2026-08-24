# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build args injected at build time for public env vars
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_CALLS_ENABLED=false
ARG NEXT_PUBLIC_LIVE_ENABLED=false
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_CALLS_ENABLED=$NEXT_PUBLIC_CALLS_ENABLED
ENV NEXT_PUBLIC_LIVE_ENABLED=$NEXT_PUBLIC_LIVE_ENABLED
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# These values are compiled into the browser bundle. Fail the image build
# instead of silently shipping a frontend with a missing, local, placeholder,
# or malformed production target.
RUN node -e 'const apiRaw = process.env.NEXT_PUBLIC_API_URL ?? ""; const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""; let api; try { api = new URL(apiRaw); } catch { throw new Error("NEXT_PUBLIC_API_URL must be an absolute URL"); } if (api.protocol !== "https:" || !api.hostname || api.username || api.password || api.pathname !== "/api" || api.search || api.hash) { throw new Error("NEXT_PUBLIC_API_URL must be a canonical HTTPS URL ending in /api"); } if (/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(api.hostname)) { throw new Error("NEXT_PUBLIC_API_URL cannot target localhost in a production image"); } if (!siteKey || /(replace|placeholder|your[-_ ])/i.test(siteKey) || siteKey.endsWith("...")) { throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing or still a placeholder"); } for (const name of ["NEXT_PUBLIC_CALLS_ENABLED", "NEXT_PUBLIC_LIVE_ENABLED"]) { if (!["true", "false"].includes(process.env[name] ?? "")) throw new Error(`${name} must be true or false`); }'

RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

# Copy standalone output + static assets + public dir
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["node", "server.js"]
