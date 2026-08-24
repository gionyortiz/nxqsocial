import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isManagedQuarantineObjectKey,
  ManagedStoragePrefix,
  StorageService,
} from './storage.service';
import { ownedLocalUploadPath } from './owned-media-cleanup';
import { MediaSafetyService } from '../../safety/media-safety.service';

const CLEANUP_INTERVAL_MS = 30_000;
const CLEANUP_BATCH_SIZE = 25;

@Injectable()
export class ObjectCleanupService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ObjectCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly safety: MediaSafetyService,
  ) {}

  onApplicationBootstrap(): void {
    void this.drain();
    this.timer = setInterval(() => void this.drain(), CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.objectCleanupJob.findMany({
        where: { nextAttemptAt: { lte: new Date() } },
        orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        take: CLEANUP_BATCH_SIZE,
      });

      for (const job of jobs) {
        try {
          await this.execute(job);
          await this.prisma.objectCleanupJob.deleteMany({
            where: { id: job.id, updatedAt: job.updatedAt },
          });
        } catch (error: any) {
          const attempts = job.attempts + 1;
          const delayMs = Math.min(
            24 * 60 * 60 * 1000,
            30_000 * 2 ** Math.min(attempts, 10),
          );
          await this.prisma.objectCleanupJob
            .updateMany({
              where: { id: job.id, updatedAt: job.updatedAt },
              data: {
                attempts: { increment: 1 },
                lastError: String(error?.message ?? 'cleanup failed').slice(0, 1000),
                nextAttemptAt: new Date(Date.now() + delayMs),
              },
            })
            .catch(() => {});
          this.logger.warn(
            `Deferred ${job.source} cleanup ${job.id}: ${error?.message ?? 'unknown error'}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(
        `Object cleanup worker failed: ${error?.message ?? 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async execute(job: {
    kind:
      | 'PUBLIC_STORAGE'
      | 'QUARANTINE_STORAGE'
      | 'MODERATION_STORAGE'
      | 'LOCAL_UPLOAD';
    reference: string;
    allowedPrefixes: string[];
  }): Promise<void> {
    const prefixes = job.allowedPrefixes as ManagedStoragePrefix[];
    if (job.kind === 'PUBLIC_STORAGE') {
      const deleted = await this.storage.deleteManagedObject(
        job.reference,
        prefixes,
      );
      if (!deleted) throw new Error('Cleanup object is outside managed prefixes');
      return;
    }
    if (job.kind === 'QUARANTINE_STORAGE') {
      if (!isManagedQuarantineObjectKey(job.reference)) {
        throw new Error('Quarantine cleanup key is outside owned prefixes');
      }
      await this.storage.deleteIncoming(job.reference);
      return;
    }
    if (job.kind === 'MODERATION_STORAGE') {
      if (!job.reference.startsWith('nxq-social/')) {
        throw new Error('Moderation cleanup key is outside nxq-social/');
      }
      await this.safety.cleanupVideoScanObject(job.reference);
      return;
    }

    const localPath = ownedLocalUploadPath(job.reference, prefixes);
    if (!localPath) throw new Error('Cleanup path is outside the upload root');
    await fs.unlink(localPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}
