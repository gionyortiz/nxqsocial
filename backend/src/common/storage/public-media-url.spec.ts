import { canonicalPublicMediaUrl } from './public-media-url';

describe('canonicalPublicMediaUrl', () => {
  const originalEnv = {
    API_BASE_URL: process.env.API_BASE_URL,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    S3_PUBLIC_BASE: process.env.S3_PUBLIC_BASE,
    S3_PUBLIC_BASE_URL: process.env.S3_PUBLIC_BASE_URL,
  };

  beforeEach(() => {
    process.env.API_BASE_URL = 'https://api.nxqsocial.com/api';
    process.env.S3_BUCKET = 'nxqsocial-media';
    delete process.env.S3_BUCKET_NAME;
    process.env.S3_PUBLIC_BASE_URL = 'https://media.nxqsocial.com';
    delete process.env.S3_PUBLIC_BASE;
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('uses the managed bucket and object key instead of a stale stored URL', () => {
    const result = canonicalPublicMediaUrl(
      'https://old-account.r2.cloudflarestorage.com/nxqsocial-media/videos/reel.mp4',
      {
        bucket: 'nxqsocial-media',
        objectKey: 'videos/reel.mp4',
        allowedPrefixes: ['videos'],
      },
    );

    expect(result).toBe('https://media.nxqsocial.com/videos/reel.mp4');
    expect(result).not.toContain('r2.cloudflarestorage.com');
  });

  it('rewrites a legacy account-specific R2 thumbnail URL', () => {
    const result = canonicalPublicMediaUrl(
      'https://abc123.r2.cloudflarestorage.com/nxqsocial-media/thumbnails/reel.jpg',
      { allowedPrefixes: ['thumbnails'] },
    );

    expect(result).toBe('https://media.nxqsocial.com/thumbnails/reel.jpg');
    expect(new URL(result!).hostname).toBe('media.nxqsocial.com');
  });

  it('suppresses a private R2 URL that is not a managed public-media key', () => {
    const result = canonicalPublicMediaUrl(
      'https://abc123.r2.cloudflarestorage.com/private-bucket/secrets/file.txt',
      { allowedPrefixes: ['videos'] },
    );

    expect(result).toBeNull();
  });

  it('does not trust a managed key recorded for another bucket', () => {
    const result = canonicalPublicMediaUrl(
      'https://external.example.test/video.mp4',
      {
        bucket: 'someone-elses-bucket',
        objectKey: 'videos/reel.mp4',
        allowedPrefixes: ['videos'],
      },
    );

    expect(result).toBe('https://external.example.test/video.mp4');
  });

  it('preserves a public external HTTPS media URL', () => {
    expect(
      canonicalPublicMediaUrl('https://public.example.test/video.mp4'),
    ).toBe('https://public.example.test/video.mp4');
  });

  it('rejects an unrelated path on the configured public media origin', () => {
    process.env.S3_PUBLIC_BASE_URL = 'https://media.nxqsocial.com/cdn';

    expect(
      canonicalPublicMediaUrl(
        'https://media.nxqsocial.com/private/videos/reel.mp4',
      ),
    ).toBeNull();
  });

  it('keeps a legacy API-relative upload on the API origin', () => {
    expect(canonicalPublicMediaUrl('/uploads/legacy.jpg')).toBe(
      'https://api.nxqsocial.com/api/uploads/legacy.jpg',
    );
  });
});
