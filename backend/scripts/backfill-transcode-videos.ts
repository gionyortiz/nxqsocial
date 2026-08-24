/**
 * One-off backfill: re-transcode every existing video MediaAsset to
 * H.264/AAC faststart MP4, fixing videos uploaded before server-side
 * transcoding existed (the ones behind "Could not load video" reports).
 *
 * Dry-run inventory (default; no writes):
 *   npm run build && npm run backfill:transcode-videos
 *
 * Execute only during an announced maintenance window with every API/worker
 * replica stopped:
 *   BACKFILL_TRANSCODE_MAINTENANCE=true \
 *   BACKFILL_TRANSCODE_CONFIRM=TRANSCODE_PUBLISHED_VIDEOS \
 *   npm run backfill:transcode-videos -- --execute
 *
 * The one-worker restriction is intentional while video processing buffers
 * complete objects in memory. Do not raise it until that pipeline is streamed.
 */
import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/common/storage/storage.service';
import { MediaSafetyService } from '../src/safety/media-safety.service';
import { VideoTranscodeService } from '../src/media/video-transcode.service';
import { runVideoTranscodeJob } from '../src/media/media.service';

const EXECUTE = process.argv.includes('--execute');
const CONFIRMATION = 'TRANSCODE_PUBLISHED_VIDEOS';
const CONCURRENCY = Number(process.env.BACKFILL_CONCURRENCY ?? 1);
const SKIP_RECENT_MS = 5 * 60 * 1000; // don't touch rows another run just processed

const prisma = new PrismaService();

async function main() {
  const logger = new Logger('BackfillTranscodeVideos');

  if (!Number.isInteger(CONCURRENCY) || CONCURRENCY !== 1) {
    throw new Error(
      'BACKFILL_CONCURRENCY must be exactly 1 until video processing is stream-based',
    );
  }
  if (EXECUTE) {
    if (process.env.BACKFILL_TRANSCODE_MAINTENANCE !== 'true') {
      throw new Error(
        'Execution requires BACKFILL_TRANSCODE_MAINTENANCE=true after all API/worker replicas are stopped',
      );
    }
    if (process.env.BACKFILL_TRANSCODE_CONFIRM !== CONFIRMATION) {
      throw new Error(
        `Execution requires BACKFILL_TRANSCODE_CONFIRM=${CONFIRMATION}`,
      );
    }
  }

  const assets = await prisma.mediaAsset.findMany({
    where: { uploadStatus: 'PUBLISHED', mimeType: { startsWith: 'video/' } },
  });

  const targets = assets.filter((a) => Date.now() - a.updatedAt.getTime() > SKIP_RECENT_MS);
  console.log(
    `${EXECUTE ? 'EXECUTE' : 'DRY RUN'}: found ${assets.length} published video assets ` +
      `(${targets.length} eligible, concurrency=${CONCURRENCY})`,
  );

  if (!EXECUTE) {
    console.log(
      'Dry run complete. No media rows or objects were changed. Stop all API/worker replicas before using --execute.',
    );
    return;
  }

  const storage = new StorageService();
  const safety = new MediaSafetyService();
  const videoTranscode = new VideoTranscodeService(storage);

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        // Claim the exact snapshot inventoried above. The maintenance gate is
        // still mandatory, but this CAS prevents an unexpected concurrent edit
        // from being overwritten.
        const claimed = await prisma.mediaAsset.updateMany({
          where: {
            id: asset.id,
            uploadStatus: 'PUBLISHED',
            updatedAt: asset.updatedAt,
          },
          data: { uploadStatus: 'TRANSCODING' },
        });
        if (claimed.count !== 1) return 'skipped' as const;

        const result = await runVideoTranscodeJob(
          { prisma, storage, safety, videoTranscode, logger },
          asset.id,
        );
        if (result !== 'completed') {
          throw new Error('Claimed asset was not processed by the transcode job');
        }
        return 'completed' as const;
      }),
    );

    for (const [idx, result] of results.entries()) {
      const asset = batch[idx];
      if (result.status === 'fulfilled' && result.value === 'completed') {
        succeeded++;
        console.log(`[ok] ${asset.id}`);
      } else if (result.status === 'fulfilled') {
        skipped++;
        console.log(`[skip] ${asset.id} changed after inventory`);
      } else {
        failed++;
        console.error(`[fail] ${asset.id}: ${(result.reason as any)?.message ?? result.reason}`);
      }
    }
  }

  console.log(
    `\nDone. eligible=${targets.length} succeeded=${succeeded} skipped=${skipped} failed=${failed}`,
  );
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
