/**
 * One-off backfill: re-transcode every existing video MediaAsset to
 * H.264/AAC faststart MP4, fixing videos uploaded before server-side
 * transcoding existed (the ones behind "Could not load video" reports).
 *
 * Usage:
 *   npx ts-node scripts/backfill-transcode-videos.ts
 *   BACKFILL_CONCURRENCY=5 npx ts-node scripts/backfill-transcode-videos.ts
 *
 * Safe to re-run: always re-transcodes and replaces in place, so a second
 * pass over an already-fixed row just re-encodes an already-good file.
 */
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/common/storage/storage.service';
import { MediaSafetyService } from '../src/safety/media-safety.service';
import { VideoTranscodeService } from '../src/media/video-transcode.service';
import { runVideoTranscodeJob } from '../src/media/media.service';

const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 3);
const SKIP_RECENT_MS = 5 * 60 * 1000; // don't touch rows another run just processed

const prisma = new PrismaService();

async function main() {
  const logger = new Logger('BackfillTranscodeVideos');
  const storage = new StorageService();
  const safety = new MediaSafetyService();
  const videoTranscode = new VideoTranscodeService(storage);

  const assets = await prisma.mediaAsset.findMany({
    where: { uploadStatus: 'PUBLISHED', mimeType: { startsWith: 'video/' } },
  });

  const targets = assets.filter((a) => Date.now() - a.updatedAt.getTime() > SKIP_RECENT_MS);
  console.log(`Found ${assets.length} published video assets (${targets.length} eligible, concurrency=${CONCURRENCY})`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        // Re-flip to TRANSCODING first so a mid-run crash doesn't leave the
        // row looking PUBLISHED-but-broken with no signal it's in flight.
        await prisma.mediaAsset.update({ where: { id: asset.id }, data: { uploadStatus: 'TRANSCODING' } });
        await runVideoTranscodeJob({ prisma, safety, videoTranscode, logger }, asset.id);
      }),
    );

    for (const [idx, result] of results.entries()) {
      const asset = batch[idx];
      if (result.status === 'fulfilled') {
        succeeded++;
        console.log(`[ok] ${asset.id}`);
      } else {
        failed++;
        console.error(`[fail] ${asset.id}: ${(result.reason as any)?.message ?? result.reason}`);
      }
    }
  }

  console.log(`\nDone. processed=${targets.length} succeeded=${succeeded} failed=${failed}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
