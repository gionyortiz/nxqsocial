# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

RUN npm ci

RUN npm run prisma:generate

COPY tsconfig*.json ./
COPY nest-cli.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# Prisma is an explicit production dependency so Railway's pre-deploy command
# stays lockfile-pinned without shipping the compiler, linter, or test toolchain.
RUN npm ci --omit=dev && npm run prisma:generate && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3000

# Railway runs `npm run db:migrate:deploy` as a pre-deploy command. Keeping the
# web process migration-free avoids concurrent migration attempts when scaling.
CMD ["npm", "run", "start:prod"]
