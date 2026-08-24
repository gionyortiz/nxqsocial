import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  cleanupUncommittedUploads,
  commitMediaAssetMigration,
  commitProfileFieldMigration,
  localUploadPath,
  migrationFolderForMimeType,
  MigrationCommitAnomaly,
  uploadAndVerify,
  validateMigrationExecutionTarget,
} from '../../../scripts/migrate-local-media-to-object-storage';

describe('local media migration path resolution', () => {
  const uploadRoot = path.resolve('migration-test-uploads');

  it('resolves legacy and API-prefixed upload URLs inside the upload root', () => {
    expect(localUploadPath('/uploads/videos/video.mp4', uploadRoot)).toBe(
      path.join(uploadRoot, 'videos', 'video.mp4'),
    );
    expect(
      localUploadPath(
        'https://api.nxqsocial.com/api/uploads/avatars/avatar.jpg',
        uploadRoot,
      ),
    ).toBe(path.join(uploadRoot, 'avatars', 'avatar.jpg'));
  });

  it('ignores remote object-storage URLs', () => {
    expect(
      localUploadPath(
        'https://media.nxqsocial.com/images/photo.jpg',
        uploadRoot,
      ),
    ).toBeNull();
  });

  it('rejects path traversal outside the upload root', () => {
    expect(localUploadPath('/uploads/../secret.txt', uploadRoot)).toBeNull();
    expect(
      localUploadPath('/uploads/%2e%2e/secret.txt', uploadRoot),
    ).toBeNull();
  });
});

describe('local media migration storage routing', () => {
  it.each([
    ['audio/mp4', 'audio'],
    ['audio/mpeg', 'audio'],
    ['video/mp4', 'videos'],
    ['video/quicktime', 'videos'],
    ['image/jpeg', 'images'],
    ['image/png', 'images'],
  ])('routes %s to the %s prefix', (mimeType, expectedFolder) => {
    expect(migrationFolderForMimeType(mimeType)).toBe(expectedFolder);
  });
});

describe('local media migration execution target', () => {
  const databaseUrl = 'postgresql://migration.invalid/staging';
  const uploadRoot = path.resolve('migration-test-uploads');
  const validEnvironment = () => ({
    DATABASE_URL: databaseUrl,
    MIGRATE_LOCAL_MEDIA_CONFIRM: 'UPLOAD_AND_UPDATE',
    MIGRATE_EXPECTED_DATABASE_URL_SHA256: createHash('sha256')
      .update(databaseUrl)
      .digest('hex'),
    MIGRATE_EXPECTED_BUCKET: 'staging-public',
    MIGRATE_EXPECTED_UPLOAD_ROOT: uploadRoot,
    MIGRATE_EXPECTED_S3_ENDPOINT: 'https://account123.r2.cloudflarestorage.com',
    MIGRATE_EXPECTED_S3_ACCOUNT_ID: 'account123',
    MIGRATE_EXPECTED_S3_PUBLIC_BASE_URL:
      'https://staging-media.example.invalid',
    S3_BUCKET: 'staging-public',
    S3_ENDPOINT: 'https://account123.r2.cloudflarestorage.com/',
    S3_PUBLIC_BASE_URL: 'https://staging-media.example.invalid/',
  });

  it('requires the exact database, bucket, root, endpoint/account, and public base', () => {
    expect(() =>
      validateMigrationExecutionTarget(validEnvironment(), uploadRoot),
    ).not.toThrow();

    for (const override of [
      { S3_ENDPOINT: 'https://other.r2.cloudflarestorage.com' },
      { MIGRATE_EXPECTED_S3_ACCOUNT_ID: 'other' },
      { S3_PUBLIC_BASE_URL: 'https://other-media.example.invalid' },
    ]) {
      expect(() =>
        validateMigrationExecutionTarget(
          { ...validEnvironment(), ...override },
          uploadRoot,
        ),
      ).toThrow(/does not match the approved migration target/);
    }
  });

  it('does not include target values or credentials in mismatch errors', () => {
    const secret = 'never-print-this-database-value';
    const environment = {
      ...validEnvironment(),
      DATABASE_URL: secret,
      AWS_SECRET_ACCESS_KEY: 'never-print-this-storage-secret',
    };

    try {
      validateMigrationExecutionTarget(environment, uploadRoot);
      throw new Error('Expected target validation to fail');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).not.toContain(environment.AWS_SECRET_ACCESS_KEY);
    }
  });
});

describe('local media migration commit reconciliation', () => {
  const asset = {
    id: 'asset-1',
    url: '/uploads/images/old.jpg',
    thumbnailUrl: '/uploads/thumbnails/old.jpg',
    s3Key: 'legacy/asset-1',
    bucket: 'local',
  };
  const media = {
    url: 'https://media.example.invalid/images/new.jpg',
    key: 'images/new.jpg',
  };
  const thumbnail = {
    url: 'https://media.example.invalid/thumbnails/new.jpg',
    key: 'thumbnails/new.jpg',
  };

  const prismaMock = () => ({
    mediaAsset: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    profile: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  });

  it('treats exact new asset values as committed after an update response error', async () => {
    const prisma = prismaMock();
    prisma.mediaAsset.updateMany.mockRejectedValue(new Error('response lost'));
    prisma.mediaAsset.findUnique.mockResolvedValue({
      url: media.url,
      thumbnailUrl: thumbnail.url,
      s3Key: media.key,
      bucket: 'staging-public',
    });

    await expect(
      commitMediaAssetMigration(
        prisma as any,
        asset,
        media,
        thumbnail,
        'staging-public',
      ),
    ).resolves.toBeUndefined();
  });

  it('cleans only uploaded asset values that the reread did not attach', async () => {
    const prisma = prismaMock();
    prisma.mediaAsset.updateMany.mockResolvedValue({ count: 0 });
    prisma.mediaAsset.findUnique.mockResolvedValue({
      url: media.url,
      thumbnailUrl: asset.thumbnailUrl,
      s3Key: media.key,
      bucket: 'staging-public',
    });
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };

    let failure: unknown;
    try {
      await commitMediaAssetMigration(
        prisma as any,
        asset,
        media,
        thumbnail,
        'staging-public',
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(MigrationCommitAnomaly);
    await cleanupUncommittedUploads(storage, [media, thumbnail], failure);

    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(storage.delete).toHaveBeenCalledWith(thumbnail.key);
    expect(storage.delete).not.toHaveBeenCalledWith(media.key);
  });

  it('retains every uploaded object when the database reread also fails', async () => {
    const prisma = prismaMock();
    prisma.mediaAsset.updateMany.mockRejectedValue(new Error('response lost'));
    prisma.mediaAsset.findUnique.mockRejectedValue(new Error('database down'));
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };

    let failure: unknown;
    try {
      await commitMediaAssetMigration(
        prisma as any,
        asset,
        media,
        thumbnail,
        'staging-public',
      );
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(MigrationCommitAnomaly);
    await cleanupUncommittedUploads(storage, [media, thumbnail], failure);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('reconciles profile update responses before deciding cleanup', async () => {
    const prisma = prismaMock();
    const profile = {
      id: 'profile-1',
      avatarUrl: '/uploads/avatars/old.jpg',
      bannerUrl: null,
    };
    const uploaded = {
      url: 'https://media.example.invalid/avatars/new.jpg',
      key: 'avatars/new.jpg',
    };
    prisma.profile.updateMany.mockRejectedValue(new Error('response lost'));
    prisma.profile.findUnique.mockResolvedValue({
      avatarUrl: uploaded.url,
      bannerUrl: null,
    });

    await expect(
      commitProfileFieldMigration(
        prisma as any,
        profile,
        'avatarUrl',
        uploaded,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('local media migration round-trip verification', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nxq-migration-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('downloads to a temporary file and verifies size, type, and SHA-256', async () => {
    const sourcePath = path.join(tempRoot, 'source.jpg');
    const contents = Buffer.from('verified-image-contents');
    await fs.writeFile(sourcePath, contents);
    const storage = {
      upload: jest
        .fn()
        .mockResolvedValue('https://media.example.invalid/images/new.jpg'),
      keyFromUrl: jest.fn().mockReturnValue('images/new.jpg'),
      inspect: jest.fn().mockResolvedValue({
        bytes: contents.length,
        contentType: 'image/jpeg',
      }),
      downloadToFile: jest.fn(async (_key: string, target: string) => {
        await fs.copyFile(sourcePath, target);
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      uploadAndVerify(storage, sourcePath, 'image/jpeg', 'images'),
    ).resolves.toEqual({
      url: 'https://media.example.invalid/images/new.jpg',
      key: 'images/new.jpg',
    });
    expect(storage.downloadToFile).toHaveBeenCalledTimes(1);
    expect(storage.delete).not.toHaveBeenCalled();
  });
});
