const PRIVATE_R2_HOSTNAME = /\.r2\.cloudflarestorage\.com$/i;

const DEFAULT_ALLOWED_PREFIXES = [
  'avatars',
  'banners',
  'images',
  'videos',
  'audio',
  'thumbnails',
  'uploads',
] as const;

interface CanonicalPublicMediaUrlOptions {
  objectKey?: string | null;
  bucket?: string | null;
  allowedPrefixes?: readonly string[];
}

function configuredPublicBase(): URL | null {
  const value = (
    process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE
  )?.trim();
  if (!value) return null;

  try {
    const url = new URL(value.endsWith('/') ? value : `${value}/`);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function configuredBucket(): string | null {
  return (process.env.S3_BUCKET_NAME ?? process.env.S3_BUCKET)?.trim() || null;
}

function managedKey(
  raw: string | null | undefined,
  allowedPrefixes: readonly string[],
): string | null {
  if (!raw) return null;
  const key = raw.trim().replace(/^\/+/, '');
  if (
    !key ||
    key.includes('\\') ||
    key.includes('?') ||
    key.includes('#') ||
    key
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }

  return allowedPrefixes.some((prefix) => key.startsWith(`${prefix}/`))
    ? key
    : null;
}

function publicUrl(base: URL, key: string): string {
  return new URL(key, base).toString();
}

function apiMediaUrl(reference: string): string {
  const apiBase = (
    process.env.API_BASE_URL ?? 'https://api.nxqsocial.com/api'
  ).replace(/\/$/, '');
  return reference.startsWith('/')
    ? `${apiBase}${reference}`
    : `${apiBase}/${reference}`;
}

/**
 * Return only a client-safe media URL.
 *
 * Managed R2 objects are reconstructed from their authoritative bucket/key
 * whenever possible. Legacy account-endpoint URLs are rewritten to the
 * configured public media origin. A private R2 URL that cannot be mapped to a
 * validated managed key is suppressed rather than exposed to API clients.
 */
export function canonicalPublicMediaUrl(
  reference: string | null | undefined,
  options: CanonicalPublicMediaUrlOptions = {},
): string | null {
  if (!reference?.trim()) return null;

  const raw = reference.trim();
  const base = configuredPublicBase();
  const bucket = configuredBucket();
  const allowedPrefixes = options.allowedPrefixes ?? DEFAULT_ALLOWED_PREFIXES;

  const authoritativeKey = managedKey(options.objectKey, allowedPrefixes);
  if (base && bucket && authoritativeKey && options.bucket === bucket) {
    return publicUrl(base, authoritativeKey);
  }

  if (!/^https?:\/\//i.test(raw)) {
    const relativeKey = base ? managedKey(raw, allowedPrefixes) : null;
    return relativeKey && !raw.startsWith('/')
      ? publicUrl(base!, relativeKey)
      : apiMediaUrl(raw);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (PRIVATE_R2_HOSTNAME.test(parsed.hostname)) {
    if (!base || !bucket) return null;

    let candidate = parsed.pathname.replace(/^\/+/, '');
    if (candidate.startsWith(`${bucket}/`)) {
      candidate = candidate.slice(bucket.length + 1);
    }
    const legacyKey = managedKey(candidate, allowedPrefixes);
    return legacyKey ? publicUrl(base, legacyKey) : null;
  }

  if (base && parsed.origin === base.origin) {
    const basePath = base.pathname.replace(/^\/+/, '');
    const path = parsed.pathname.replace(/^\/+/, '');
    if (basePath && !path.startsWith(basePath)) return null;
    const candidate = basePath ? path.slice(basePath.length) : path;
    const currentKey = managedKey(candidate, allowedPrefixes);
    return currentKey ? publicUrl(base, currentKey) : null;
  }

  return raw;
}
