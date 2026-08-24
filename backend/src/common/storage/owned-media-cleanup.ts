import { promises as fs } from 'fs';
import * as path from 'path';
import {
  ManagedStoragePrefix,
  StorageService,
} from './storage.service';

export interface OwnedMediaReference {
  value: string | null | undefined;
  prefixes: readonly ManagedStoragePrefix[];
}

export interface OwnedMediaCleanupResult {
  deleted: number;
  skipped: number;
  failed: number;
}

interface CleanupJobWriter {
  objectCleanupJob: {
    createMany(args: {
      data: Array<{
        kind: 'PUBLIC_STORAGE' | 'LOCAL_UPLOAD';
        reference: string;
        allowedPrefixes: string[];
        source: string;
      }>;
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
  };
}

function localUploadPathname(reference: string): string | null {
  if (reference.startsWith('/')) return reference;
  if (!/^https?:\/\//i.test(reference)) return null;

  try {
    const candidate = new URL(reference);
    const configuredApi = new URL(
      process.env.API_BASE_URL ?? 'https://api.nxqsocial.com/api',
    );
    return candidate.origin === configuredApi.origin ? candidate.pathname : null;
  } catch {
    return null;
  }
}

/**
 * Resolve only application-owned local upload paths under the expected media
 * prefixes. path.relative prevents sibling-prefix and traversal escapes on
 * both Windows and POSIX hosts.
 */
export function ownedLocalUploadPath(
  reference: string | null | undefined,
  allowedPrefixes: readonly ManagedStoragePrefix[],
): string | null {
  if (!reference || allowedPrefixes.length === 0) return null;
  let pathname = localUploadPathname(reference.trim());
  if (!pathname) return null;

  if (pathname.startsWith('/api/uploads/')) {
    pathname = pathname.slice('/api'.length);
  }
  if (!pathname.startsWith('/uploads/')) return null;

  const relativePath = pathname.slice('/uploads/'.length);
  const firstSegment = relativePath.split('/', 1)[0];
  if (!allowedPrefixes.includes(firstSegment as ManagedStoragePrefix)) return null;

  const uploadRoot = path.resolve(process.cwd(), 'uploads');
  const filePath = path.resolve(uploadRoot, relativePath);
  const relativeToRoot = path.relative(uploadRoot, filePath);
  if (
    !relativeToRoot ||
    relativeToRoot.startsWith('..') ||
    path.isAbsolute(relativeToRoot)
  ) {
    return null;
  }
  return filePath;
}

/** Return a stable identity only for a positively owned local/object reference. */
export function ownedMediaReferenceIdentity(
  storage: StorageService,
  reference: OwnedMediaReference,
): string | null {
  const localPath = ownedLocalUploadPath(reference.value, reference.prefixes);
  if (localPath) return `local:${path.normalize(localPath).toLowerCase()}`;

  const key = storage.managedKeyFromReference(
    reference.value,
    reference.prefixes,
  );
  return key ? `object:${storage.bucketName}:${key}` : null;
}

/** Persist positively-owned deletion work in the caller's transaction. */
export async function queueOwnedMediaCleanup(
  writer: CleanupJobWriter,
  storage: StorageService,
  references: readonly OwnedMediaReference[],
  source: string,
): Promise<number> {
  const jobs = new Map<
    string,
    {
      kind: 'PUBLIC_STORAGE' | 'LOCAL_UPLOAD';
      reference: string;
      allowedPrefixes: string[];
      source: string;
    }
  >();

  for (const reference of references) {
    const value = reference.value?.trim();
    if (!value) continue;
    const allowedPrefixes = [...reference.prefixes];
    const localPath = ownedLocalUploadPath(value, reference.prefixes);
    if (localPath) {
      jobs.set(`local:${path.normalize(localPath).toLowerCase()}`, {
        kind: 'LOCAL_UPLOAD',
        reference: value,
        allowedPrefixes,
        source,
      });
      continue;
    }

    const key = storage.managedKeyFromReference(value, reference.prefixes);
    if (key) {
      jobs.set(`object:${storage.bucketName}:${key}`, {
        kind: 'PUBLIC_STORAGE',
        reference: key,
        allowedPrefixes,
        source,
      });
    }
  }

  if (jobs.size === 0) return 0;
  const result = await writer.objectCleanupJob.createMany({
    data: [...jobs.values()],
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * Best-effort, de-duplicated deletion for positively owned references. The
 * caller should invoke this only after its database transaction commits.
 */
export async function cleanupOwnedMediaReferences(
  storage: StorageService,
  references: readonly OwnedMediaReference[],
  onError?: (error: unknown) => void,
): Promise<OwnedMediaCleanupResult> {
  const operations = new Map<string, () => Promise<void>>();
  let skipped = 0;

  for (const reference of references) {
    const localPath = ownedLocalUploadPath(reference.value, reference.prefixes);
    if (localPath) {
      const identity = `local:${path.normalize(localPath).toLowerCase()}`;
      if (!operations.has(identity)) {
        operations.set(identity, async () => {
          await fs.unlink(localPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        });
      }
      continue;
    }

    const key = storage.managedKeyFromReference(
      reference.value,
      reference.prefixes,
    );
    if (!key) {
      skipped += 1;
      continue;
    }

    const identity = `object:${storage.bucketName}:${key}`;
    if (!operations.has(identity)) {
      operations.set(identity, async () => {
        await storage.deleteManagedObject(key, reference.prefixes);
      });
    }
  }

  const results = await Promise.allSettled(
    Array.from(operations.values(), (operation) => operation()),
  );
  let deleted = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      deleted += 1;
    } else {
      failed += 1;
      onError?.(result.reason);
    }
  }

  return { deleted, skipped, failed };
}
