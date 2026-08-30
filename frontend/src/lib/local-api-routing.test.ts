import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalApiUrl = process.env.NEXT_PUBLIC_API_URL;

describe('local API routing', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = originalApiUrl;
    }
    vi.resetModules();
  });

  it('keeps local API requests on the frontend origin', async () => {
    const { api } = await import('./api');

    expect(api.defaults.baseURL).toBe('/api');
  });

  it('keeps relative media paths on the frontend origin', async () => {
    const { resolveMediaUrl } = await import('./utils');

    expect(resolveMediaUrl('/uploads/test.png')).toBe('/uploads/test.png');
  });
});
