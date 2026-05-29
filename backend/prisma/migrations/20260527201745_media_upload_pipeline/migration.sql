/*
  Warnings:

  - A unique constraint covering the columns `[s3Key]` on the table `MediaAsset` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `bucket` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `s3Key` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `size` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `MediaAsset` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'SCANNING', 'PUBLISHED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "MediaAsset" DROP CONSTRAINT "MediaAsset_postId_fkey";

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "bucket" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "s3Key" TEXT NOT NULL,
ADD COLUMN     "safetyJobId" TEXT,
ADD COLUMN     "safetyResult" JSONB,
ADD COLUMN     "size" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "uploadStatus" "UploadStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "postId" DROP NOT NULL,
ALTER COLUMN "url" DROP NOT NULL,
ALTER COLUMN "moderationStatus" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_s3Key_key" ON "MediaAsset"("s3Key");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
