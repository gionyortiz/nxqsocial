# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build args injected at build time for public env vars
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_BETA_MODE
ARG NEXT_PUBLIC_CALLS_ENABLED
ARG NEXT_PUBLIC_LIVE_ENABLED
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BETA_MODE=$NEXT_PUBLIC_BETA_MODE
ENV NEXT_PUBLIC_CALLS_ENABLED=$NEXT_PUBLIC_CALLS_ENABLED
ENV NEXT_PUBLIC_LIVE_ENABLED=$NEXT_PUBLIC_LIVE_ENABLED

RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy standalone output + static assets + public dir
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3001

CMD ["node", "server.js"]
