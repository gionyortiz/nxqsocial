export interface FeedPage<T> {
  data: T[];
  nextCursor: string | null;
}

/**
 * Keeps the Feed contract strict at the client boundary.  A malformed response
 * must become a recoverable Feed error rather than an infinite loading view.
 */
export function parseFeedPage<T>(payload: unknown): FeedPage<T> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Feed response is missing.');
  }

  const response = payload as { data?: unknown; nextCursor?: unknown };
  if (!Array.isArray(response.data)) {
    throw new Error('Feed response is malformed.');
  }

  return {
    data: response.data as T[],
    nextCursor:
      typeof response.nextCursor === 'string' && response.nextCursor.trim().length > 0
        ? response.nextCursor
        : null,
  };
}

/**
 * A reset intentionally supersedes an older request; pagination never does.
 * Keeping this rule pure makes the request gate easy to regression-test.
 */
export function shouldRequestFeedPage({
  inFlight,
  hasMore,
  reset,
}: {
  inFlight: boolean;
  hasMore: boolean;
  reset: boolean;
}) {
  return reset || (!inFlight && hasMore);
}

export function isCancelledFeedRequest(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ERR_CANCELED'
  );
}
