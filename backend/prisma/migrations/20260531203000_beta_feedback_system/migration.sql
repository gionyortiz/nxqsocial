-- CreateEnum
CREATE TYPE "BetaFeedbackType" AS ENUM (
    'BUG',
    'UI_PROBLEM',
    'UPLOAD_PROBLEM',
    'CALL_PROBLEM',
    'LIVE_PROBLEM',
    'VERIFICATION_PROBLEM',
    'SUGGESTION'
);

-- CreateEnum
CREATE TYPE "BetaFeedbackSeverity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'BLOCKING'
);

-- CreateEnum
CREATE TYPE "BetaDeviceType" AS ENUM (
    'MOBILE',
    'DESKTOP',
    'TABLET'
);

-- CreateEnum
CREATE TYPE "BetaFeedbackStatus" AS ENUM (
    'OPEN',
    'TRIAGED',
    'IN_PROGRESS',
    'RESOLVED',
    'WONT_FIX'
);

-- CreateTable
CREATE TABLE "BetaFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BetaFeedbackType" NOT NULL,
    "severity" "BetaFeedbackSeverity" NOT NULL,
    "route" TEXT NOT NULL,
    "deviceType" "BetaDeviceType" NOT NULL,
    "browser" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "status" "BetaFeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BetaFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BetaFeedback_status_createdAt_idx" ON "BetaFeedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BetaFeedback_severity_createdAt_idx" ON "BetaFeedback"("severity", "createdAt");

-- CreateIndex
CREATE INDEX "BetaFeedback_type_createdAt_idx" ON "BetaFeedback"("type", "createdAt");

-- CreateIndex
CREATE INDEX "BetaFeedback_userId_createdAt_idx" ON "BetaFeedback"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BetaFeedback" ADD CONSTRAINT "BetaFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
