/**
 * Inventory and migrate legacy /uploads/* database references to R2/S3.
 *
 * Dry-run is the default and performs no object uploads or database writes:
 *   npm run build && npm run migrate:local-media
 *
 * Turn the inventory into an automated release gate:
 *   npm run migrate:local-media -- --require-zero
 *
 * Execution is intentionally gated by an explicit confirmation plus exact
 * database, bucket, endpoint/account, public-base, and source-root identities.
 *
 * The script never deletes local files. Keep the upload directory with the
 * Windows rollback deployment until the post-cutover retention window ends.
 */
import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  StorageService,
  type StorageFolder,
} from '../src/common/storage/storage.service';

const EXECUTE = process.argv.includes('--execute');
const REQUIRE_ZERO = process.argv.includes('--require-zero');
const CONFIRMATION = 'UPLOAD_AND_UPDATE';

type MigrationEnvironment = Record<string, string | undefined>;

export type UploadedMigrationObject = { url: string; key: string };

export class MigrationCommitAnomaly extends Error {
  constructor(
    message: string,
    readonly cleanupKeys: readonly string[],
  ) {
    super(message);
    this.name = 'MigrationCommitAnomaly';
  }
}

interface MigrationStorage {
  upload(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    folder: StorageFolder,
  ): Promise<string>;
  keyFromUrl(urlOrKey: string): string;
  inspect(key: string): Promise<{ bytes: number; contentType: string } | null>;
  downloadToFile(key: string, filePath: string): Promise<void>;
  delete(keyOrUrl: string): Promise<void>;
}

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

const UPLOAD_ROOT = path.resolve(
  argumentValue('upload-root') ?? path.join(process.cwd(), 'uploads'),
);

function sha256Value(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalHttpsIdentity(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host.toLowerCase()}${pathname}`;
  } catch {
    return null;
  }
}

function r2AccountIdentity(endpoint: string): string | null {
  const canonical = canonicalHttpsIdentity(endpoint);
  if (!canonical) return null;
  const hostname = new URL(canonical).hostname.toLowerCase();
  const suffix = '.r2.cloudflarestorage.com';
  if (!hostname.endsWith(suffix)) return null;
  const account = hostname.slice(0, -suffix.length);
  return account && !account.includes('.') ? account : null;
}

/** Validate execution identities without returning or logging their values. */
export function validateMigrationExecutionTarget(
  environment: MigrationEnvironment,
  uploadRoot = UPLOAD_ROOT,
): void {
  if (environment.MIGRATE_LOCAL_MEDIA_CONFIRM !== CONFIRMATION) {
    throw new Error(
      `Execution requires MIGRATE_LOCAL_MEDIA_CONFIRM=${CONFIRMATION}`,
    );
  }

  const required = [
    'MIGRATE_EXPECTED_DATABASE_URL_SHA256',
    'MIGRATE_EXPECTED_BUCKET',
    'MIGRATE_EXPECTED_UPLOAD_ROOT',
    'MIGRATE_EXPECTED_S3_ENDPOINT',
    'MIGRATE_EXPECTED_S3_ACCOUNT_ID',
    'MIGRATE_EXPECTED_S3_PUBLIC_BASE_URL',
  ] as const;
  if (required.some((name) => !environment[name]?.trim())) {
    throw new Error(
      'Execution requires every MIGRATE_EXPECTED_* target identity',
    );
  }

  const expectedDatabaseHash = environment
    .MIGRATE_EXPECTED_DATABASE_URL_SHA256!.trim()
    .toLowerCase();
  if (
    !/^[a-f0-9]{64}$/.test(expectedDatabaseHash) ||
    sha256Value(environment.DATABASE_URL ?? '') !== expectedDatabaseHash
  ) {
    throw new Error(
      'DATABASE_URL does not match the explicitly approved migration target',
    );
  }

  const configuredBucket = (
    environment.S3_BUCKET_NAME ??
    environment.S3_BUCKET ??
    ''
  ).trim();
  if (configuredBucket !== environment.MIGRATE_EXPECTED_BUCKET!.trim()) {
    throw new Error(
      'Object-storage bucket does not match the approved migration target',
    );
  }

  if (
    path.resolve(environment.MIGRATE_EXPECTED_UPLOAD_ROOT!.trim()) !==
    path.resolve(uploadRoot)
  ) {
    throw new Error(
      'Upload root does not match the explicitly approved migration source',
    );
  }

  const endpoint = canonicalHttpsIdentity(environment.S3_ENDPOINT ?? '');
  const expectedEndpoint = canonicalHttpsIdentity(
    environment.MIGRATE_EXPECTED_S3_ENDPOINT!,
  );
  if (!endpoint || !expectedEndpoint || endpoint !== expectedEndpoint) {
    throw new Error(
      'Object-storage endpoint does not match the approved migration target',
    );
  }

  const account = r2AccountIdentity(endpoint);
  if (
    !account ||
    account !== environment.MIGRATE_EXPECTED_S3_ACCOUNT_ID!.trim().toLowerCase()
  ) {
    throw new Error(
      'Object-storage account does not match the approved migration target',
    );
  }

  const publicBase = canonicalHttpsIdentity(
    environment.S3_PUBLIC_BASE_URL ?? '',
  );
  const expectedPublicBase = canonicalHttpsIdentity(
    environment.MIGRATE_EXPECTED_S3_PUBLIC_BASE_URL!,
  );
  if (
    !publicBase ||
    !expectedPublicBase ||
    publicBase !== expectedPublicBase ||
    new URL(publicBase).origin === new URL(endpoint).origin
  ) {
    throw new Error(
      'Public media base does not match the approved migration target',
    );
  }
}

export function localUploadPath(
  url: string | null | undefined,
  uploadRoot = UPLOAD_ROOT,
  allowedOrigins = [
    process.env.API_BASE_URL ?? 'https://api.nxqsocial.com/api',
    ...(process.env.LEGACY_LOCAL_MEDIA_ORIGINS ?? '').split(','),
  ],
): string | null {
  if (!url) return null;

  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      const origins = allowedOrigins
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          try {
            return new URL(value).origin;
          } catch {
            return null;
          }
        })
        .filter((origin): origin is string => Boolean(origin));
      if (!origins.includes(parsed.origin)) return null;
      pathname = parsed.pathname;
    } catch {
      return null;
    }
  }

  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (pathname.startsWith('/api/uploads/'))
    pathname = pathname.slice('/api'.length);
  if (!pathname.startsWith('/uploads/')) return null;

  const root = path.resolve(uploadRoot);
  const relative = pathname
    .slice('/uploads/'.length)
    .replace(/[\\/]+/g, path.sep);
  const candidate = path.resolve(root, relative);
  if (candidate === root || !candidate.startsWith(`${root}${path.sep}`))
    return null;
  return candidate;
}

function mimeFromFilename(filename: string): string {
  switch (path.extname(filename).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.heic':
      return 'image/heic';
    case '.heif':
      return 'image/heif';
    case '.webm':
      return 'video/webm';
    case '.mov':
      return 'video/quicktime';
    case '.mp4':
      return 'video/mp4';
    default:
      return 'application/octet-stream';
  }
}

export function migrationFolderForMimeType(mimeType: string): StorageFolder {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized.startsWith('video/')) return 'videos';
  if (normalized.startsWith('audio/')) return 'audio';
  return 'images';
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}

async function describeLocalFile(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return {
      exists: true,
      bytes: stat.size,
      sha256: await sha256File(filePath),
    };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { exists: false, bytes: 0, sha256: null };
    throw error;
  }
}

export async function uploadAndVerify(
  storage: MigrationStorage,
  filePath: string,
  mimeType: string,
  folder: StorageFolder,
): Promise<UploadedMigrationObject> {
  let sourceBytes = 0;
  let sourceSha256 = '';
  let url = '';
  {
    // StorageService's upload contract requires a Buffer. Keep it in this
    // narrow scope so it is no longer referenced before the round-trip file is
    // streamed back and hashed.
    const source = await fs.readFile(filePath);
    sourceBytes = source.length;
    sourceSha256 = createHash('sha256').update(source).digest('hex');
    url = await storage.upload(
      source,
      path.basename(filePath),
      mimeType,
      folder,
    );
  }
  const key = storage.keyFromUrl(url);
  const roundTripPath = path.join(
    os.tmpdir(),
    `nxq-local-media-migration-${randomUUID()}`,
  );
  try {
    const metadata = await storage.inspect(key);
    if (!metadata) throw new Error('Uploaded object metadata is unavailable');
    await storage.downloadToFile(key, roundTripPath);
    const roundTripStat = await fs.stat(roundTripPath);
    const roundTripSha256 = await sha256File(roundTripPath);
    if (
      metadata.bytes !== sourceBytes ||
      roundTripStat.size !== sourceBytes ||
      metadata.contentType !== mimeType.toLowerCase() ||
      roundTripSha256 !== sourceSha256
    ) {
      throw new Error('Uploaded object identity does not match the source');
    }
  } catch {
    await storage.delete(key).catch(() => {});
    throw new Error(
      'Object size/type/checksum verification failed after upload',
    );
  } finally {
    await fs.unlink(roundTripPath).catch(() => {});
  }
  return { url, key };
}

type MediaAssetMigrationSnapshot = {
  id: string;
  url: string | null;
  thumbnailUrl: string | null;
  s3Key: string;
  bucket: string;
};

type ProfileMigrationSnapshot = {
  id: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
};

/**
 * Apply one asset migration and reconcile ambiguous database responses. If a
 * timeout happens after commit, the reread treats the exact new values as
 * committed. On a real conflict, cleanupKeys contains only uploaded objects
 * that the current row does not reference. If the reread itself fails, no key
 * is safe to delete and the caller retains all uploaded copies.
 */
export async function commitMediaAssetMigration(
  prisma: PrismaService,
  asset: MediaAssetMigrationSnapshot,
  media: UploadedMigrationObject | null,
  thumbnail: UploadedMigrationObject | null,
  bucket: string,
): Promise<void> {
  let count: number | null = null;
  try {
    const committed = await prisma.mediaAsset.updateMany({
      where: {
        id: asset.id,
        url: asset.url,
        thumbnailUrl: asset.thumbnailUrl,
        s3Key: asset.s3Key,
        bucket: asset.bucket,
      },
      data: {
        ...(media ? { url: media.url, s3Key: media.key, bucket } : {}),
        ...(thumbnail ? { thumbnailUrl: thumbnail.url } : {}),
      },
    });
    count = committed.count;
  } catch {
    // The database can commit and then lose the response. Resolve from state.
  }

  if (count === 1) return;

  let current: {
    url: string | null;
    thumbnailUrl: string | null;
    s3Key: string;
    bucket: string;
  } | null;
  try {
    current = await prisma.mediaAsset.findUnique({
      where: { id: asset.id },
      select: { url: true, thumbnailUrl: true, s3Key: true, bucket: true },
    });
  } catch {
    throw new MigrationCommitAnomaly(
      `Media asset ${asset.id} commit outcome could not be verified; uploaded copies were retained`,
      [],
    );
  }

  const mediaAttached =
    !media ||
    (current?.url === media.url &&
      current.s3Key === media.key &&
      current.bucket === bucket);
  const thumbnailAttached =
    !thumbnail || current?.thumbnailUrl === thumbnail.url;
  if (mediaAttached && thumbnailAttached) return;

  throw new MigrationCommitAnomaly(
    `Media asset ${asset.id} changed during migration; unattached uploaded copies require cleanup`,
    [
      ...(!mediaAttached && media ? [media.key] : []),
      ...(!thumbnailAttached && thumbnail ? [thumbnail.key] : []),
    ],
  );
}

export async function commitProfileFieldMigration(
  prisma: PrismaService,
  profile: ProfileMigrationSnapshot,
  field: 'avatarUrl' | 'bannerUrl',
  uploaded: UploadedMigrationObject,
): Promise<void> {
  let count: number | null = null;
  try {
    const committed = await prisma.profile.updateMany({
      where: { id: profile.id, [field]: profile[field] },
      data: { [field]: uploaded.url },
    });
    count = committed.count;
  } catch {
    // Resolve a possibly committed write by rereading the exact target field.
  }

  if (count === 1) return;

  let current: { avatarUrl: string | null; bannerUrl: string | null } | null;
  try {
    current = await prisma.profile.findUnique({
      where: { id: profile.id },
      select: { avatarUrl: true, bannerUrl: true },
    });
  } catch {
    throw new MigrationCommitAnomaly(
      `Profile ${profile.id} ${field} commit outcome could not be verified; uploaded copy was retained`,
      [],
    );
  }

  if (current?.[field] === uploaded.url) return;
  throw new MigrationCommitAnomaly(
    `Profile ${profile.id} ${field} changed during migration; unattached uploaded copy requires cleanup`,
    [uploaded.key],
  );
}

export async function cleanupUncommittedUploads(
  storage: Pick<MigrationStorage, 'delete'>,
  uploaded: readonly UploadedMigrationObject[],
  error: unknown,
): Promise<void> {
  const fallbackKeys = uploaded.map((object) => object.key);
  const cleanupKeys =
    error instanceof MigrationCommitAnomaly ? error.cleanupKeys : fallbackKeys;
  await Promise.all(
    [...new Set(cleanupKeys)].map((key) => storage.delete(key).catch(() => {})),
  );
}

async function main() {
  if (EXECUTE) {
    validateMigrationExecutionTarget(process.env, UPLOAD_ROOT);
  }

  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const [assets, profiles] = await Promise.all([
      prisma.mediaAsset.findMany({
        where: {
          OR: [{ url: { not: null } }, { thumbnailUrl: { not: null } }],
        },
        select: {
          id: true,
          url: true,
          thumbnailUrl: true,
          mimeType: true,
          s3Key: true,
          bucket: true,
        },
      }),
      prisma.profile.findMany({
        where: {
          OR: [{ avatarUrl: { not: null } }, { bannerUrl: { not: null } }],
        },
        select: { id: true, userId: true, avatarUrl: true, bannerUrl: true },
      }),
    ]);

    const assetTargets = assets
      .map((asset) => ({
        ...asset,
        localMedia: localUploadPath(asset.url),
        localThumbnail: localUploadPath(asset.thumbnailUrl),
      }))
      .filter((asset) => asset.localMedia || asset.localThumbnail);
    const profileTargets = profiles
      .map((profile) => ({
        ...profile,
        localAvatar: localUploadPath(profile.avatarUrl),
        localBanner: localUploadPath(profile.bannerUrl),
      }))
      .filter((profile) => profile.localAvatar || profile.localBanner);

    console.log(
      `${EXECUTE ? 'EXECUTE' : 'DRY RUN'}: ${assetTargets.length} media asset(s), ` +
        `${profileTargets.length} profile(s), uploadRoot=${UPLOAD_ROOT}`,
    );

    if (
      REQUIRE_ZERO &&
      (assetTargets.length > 0 || profileTargets.length > 0)
    ) {
      throw new Error(
        `Legacy local-media gate failed: ${assetTargets.length} media asset(s) and ` +
          `${profileTargets.length} profile(s) still reference /uploads paths`,
      );
    }

    let missing = 0;
    for (const asset of assetTargets) {
      for (const [field, filePath] of [
        ['url', asset.localMedia],
        ['thumbnailUrl', asset.localThumbnail],
      ] as const) {
        if (!filePath) continue;
        const detail = await describeLocalFile(filePath);
        if (!detail.exists) missing += 1;
        console.log(
          `[asset ${asset.id}] ${field}: ${filePath} ` +
            `${detail.exists ? `${detail.bytes} bytes sha256=${detail.sha256}` : 'MISSING'}`,
        );
      }
    }
    for (const profile of profileTargets) {
      for (const [field, filePath] of [
        ['avatarUrl', profile.localAvatar],
        ['bannerUrl', profile.localBanner],
      ] as const) {
        if (!filePath) continue;
        const detail = await describeLocalFile(filePath);
        if (!detail.exists) missing += 1;
        console.log(
          `[profile ${profile.id}] ${field}: ${filePath} ` +
            `${detail.exists ? `${detail.bytes} bytes sha256=${detail.sha256}` : 'MISSING'}`,
        );
      }
    }

    if (!EXECUTE) {
      console.log(
        `Dry run complete: missing=${missing}. No objects uploaded and no database rows changed.`,
      );
      return;
    }
    if (missing > 0) {
      throw new Error(
        `Refusing migration because ${missing} referenced local file(s) are missing`,
      );
    }

    const storage = new StorageService();
    if (!storage.isEnabled) throw new Error('R2/S3 storage is not configured');
    const bucket = process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET;
    if (!bucket) throw new Error('S3_BUCKET or S3_BUCKET_NAME is required');

    let migratedFields = 0;
    for (const asset of assetTargets) {
      const uploaded: Array<{ url: string; key: string }> = [];
      try {
        const media = asset.localMedia
          ? await uploadAndVerify(
              storage,
              asset.localMedia,
              asset.mimeType,
              migrationFolderForMimeType(asset.mimeType),
            )
          : null;
        if (media) uploaded.push(media);
        const thumbnail = asset.localThumbnail
          ? await uploadAndVerify(
              storage,
              asset.localThumbnail,
              mimeFromFilename(asset.localThumbnail),
              'thumbnails',
            )
          : null;
        if (thumbnail) uploaded.push(thumbnail);

        await commitMediaAssetMigration(
          prisma,
          asset,
          media,
          thumbnail,
          bucket,
        );
        migratedFields += Number(Boolean(media)) + Number(Boolean(thumbnail));
        console.log(`[ok] migrated media asset ${asset.id}`);
      } catch (error) {
        await cleanupUncommittedUploads(storage, uploaded, error);
        throw error;
      }
    }

    for (const profile of profileTargets) {
      for (const [field, filePath, folder] of [
        ['avatarUrl', profile.localAvatar, 'avatars'],
        ['bannerUrl', profile.localBanner, 'banners'],
      ] as const) {
        if (!filePath) continue;
        const uploaded = await uploadAndVerify(
          storage,
          filePath,
          mimeFromFilename(filePath),
          folder,
        );
        try {
          await commitProfileFieldMigration(prisma, profile, field, uploaded);
          migratedFields += 1;
          console.log(`[ok] migrated profile ${profile.id} ${field}`);
        } catch (error) {
          await cleanupUncommittedUploads(storage, [uploaded], error);
          throw error;
        }
      }
    }

    console.log(
      `Migration complete: fields=${migratedFields}. Local files were retained for rollback.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
