import { describe, expect, it } from 'vitest';
import {
  isCancelledFeedRequest,
  parseFeedPage,
  shouldRequestFeedPage,
} from './feed-page-state';

describe('Feed page response contract', () => {
  it('keeps a valid page and normalizes an empty cursor', () => {
    expect(parseFeedPage<{ id: string }>({ data: [{ id: 'post-1' }], nextCursor: '' })).toEqual({
      data: [{ id: 'post-1' }],
      nextCursor: null,
    });
  });

  it('rejects a malformed page instead of leaving the UI loading forever', () => {
    expect(() => parseFeedPage({ nextCursor: null })).toThrow('Feed response is malformed.');
  });
});

describe('Feed page request gate', () => {
  it('allows exactly the useful pagination states', () => {
    expect(shouldRequestFeedPage({ inFlight: false, hasMore: true, reset: false })).toBe(true);
    expect(shouldRequestFeedPage({ inFlight: true, hasMore: true, reset: false })).toBe(false);
    expect(shouldRequestFeedPage({ inFlight: false, hasMore: false, reset: false })).toBe(false);
  });

  it('allows a reset to replace a stale request', () => {
    expect(shouldRequestFeedPage({ inFlight: true, hasMore: false, reset: true })).toBe(true);
  });

  it('recognizes an aborted request without exposing it as an error state', () => {
    expect(isCancelledFeedRequest({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isCancelledFeedRequest(new Error('network down'))).toBe(false);
  });
});
