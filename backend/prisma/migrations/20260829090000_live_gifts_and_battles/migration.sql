-- Governed live co-hosts, battles, purchased coin wallets, and gift ledger.

CREATE TYPE "LiveParticipantRole" AS ENUM ('HOST', 'COHOST');
CREATE TYPE "LiveParticipantStatus" AS ENUM ('APPROVED', 'LEFT');
CREATE TYPE "LiveBattleStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELED');
CREATE TYPE "CoinPurchaseStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'DISPUTED', 'CANCELED');

CREATE TABLE "LiveParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "LiveParticipantRole" NOT NULL,
    "status" "LiveParticipantStatus" NOT NULL DEFAULT 'APPROVED',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LiveBattle" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "opponentId" TEXT NOT NULL,
    "status" "LiveBattleStatus" NOT NULL DEFAULT 'ACTIVE',
    "hostScoreCoins" INTEGER NOT NULL DEFAULT 0,
    "opponentScoreCoins" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "LiveBattle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoinWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceCoins" INTEGER NOT NULL DEFAULT 0,
    "lifetimePurchased" INTEGER NOT NULL DEFAULT 0,
    "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
    "creatorEarningsCoins" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoinWallet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoinPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packCode" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "status" "CoinPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    CONSTRAINT "CoinPurchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftTransaction" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "battleId" TEXT,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "giftCode" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "creatorEarningsCoins" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftTransaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GiftWebhookEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GiftWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveParticipant_sessionId_userId_key" ON "LiveParticipant"("sessionId", "userId");
CREATE INDEX "LiveParticipant_sessionId_role_status_idx" ON "LiveParticipant"("sessionId", "role", "status");
CREATE INDEX "LiveParticipant_userId_status_idx" ON "LiveParticipant"("userId", "status");
CREATE INDEX "LiveBattle_sessionId_status_idx" ON "LiveBattle"("sessionId", "status");
CREATE INDEX "LiveBattle_hostId_startedAt_idx" ON "LiveBattle"("hostId", "startedAt");
CREATE INDEX "LiveBattle_opponentId_startedAt_idx" ON "LiveBattle"("opponentId", "startedAt");
CREATE UNIQUE INDEX "CoinWallet_userId_key" ON "CoinWallet"("userId");
CREATE UNIQUE INDEX "CoinPurchase_stripeSessionId_key" ON "CoinPurchase"("stripeSessionId");
CREATE UNIQUE INDEX "CoinPurchase_stripePaymentIntentId_key" ON "CoinPurchase"("stripePaymentIntentId");
CREATE INDEX "CoinPurchase_userId_createdAt_idx" ON "CoinPurchase"("userId", "createdAt");
CREATE INDEX "CoinPurchase_status_createdAt_idx" ON "CoinPurchase"("status", "createdAt");
CREATE UNIQUE INDEX "GiftTransaction_clientRequestId_key" ON "GiftTransaction"("clientRequestId");
CREATE INDEX "GiftTransaction_sessionId_createdAt_idx" ON "GiftTransaction"("sessionId", "createdAt");
CREATE INDEX "GiftTransaction_battleId_createdAt_idx" ON "GiftTransaction"("battleId", "createdAt");
CREATE INDEX "GiftTransaction_senderId_createdAt_idx" ON "GiftTransaction"("senderId", "createdAt");
CREATE INDEX "GiftTransaction_recipientId_createdAt_idx" ON "GiftTransaction"("recipientId", "createdAt");

ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveParticipant" ADD CONSTRAINT "LiveParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveBattle" ADD CONSTRAINT "LiveBattle_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveBattle" ADD CONSTRAINT "LiveBattle_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LiveBattle" ADD CONSTRAINT "LiveBattle_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinWallet" ADD CONSTRAINT "CoinWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoinPurchase" ADD CONSTRAINT "CoinPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_battleId_fkey" FOREIGN KEY ("battleId") REFERENCES "LiveBattle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GiftTransaction" ADD CONSTRAINT "GiftTransaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
