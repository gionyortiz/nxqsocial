-- Claim direct-to-object-storage uploads while the server validates metadata,
-- promotes the client-writable object, and completes moderation.
ALTER TYPE "UploadStatus" ADD VALUE 'FINALIZING' AFTER 'PENDING';

-- A durable deletion claim prevents upload completion or content attachment
-- from racing object-store cleanup. Workers retry rows left in this state.
ALTER TYPE "UploadStatus" ADD VALUE 'REMOVING' AFTER 'REJECTED';

CREATE TYPE "ObjectCleanupKind" AS ENUM ('PUBLIC_STORAGE', 'QUARANTINE_STORAGE', 'MODERATION_STORAGE', 'LOCAL_UPLOAD');

CREATE TABLE "ObjectCleanupJob" (
    "id" TEXT NOT NULL,
    "kind" "ObjectCleanupKind" NOT NULL,
    "reference" TEXT NOT NULL,
    "allowedPrefixes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "source" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ObjectCleanupJob_kind_reference_key"
ON "ObjectCleanupJob"("kind", "reference");
CREATE INDEX "ObjectCleanupJob_nextAttemptAt_createdAt_idx"
ON "ObjectCleanupJob"("nextAttemptAt", "createdAt");

ALTER TABLE "MediaAsset" ADD COLUMN "finalizationToken" TEXT;
