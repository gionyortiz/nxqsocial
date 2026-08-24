import {
  assertMatchingVideoDuration,
  assertValidVideoDuration,
  MAX_VIDEO_DURATION_SEC,
  normalizeVideoDurationSec,
  TranscodeFailedError,
} from './video-transcode.service';

describe('video transcode resource guards', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1])(
    'rejects non-finite or non-positive duration %s',
    (durationSec) => {
      expect(() => assertValidVideoDuration(durationSec)).toThrow(
        TranscodeFailedError,
      );
    },
  );

  it('enforces the hard duration limit', () => {
    expect(() => assertValidVideoDuration(MAX_VIDEO_DURATION_SEC)).not.toThrow();
    expect(() =>
      assertValidVideoDuration(MAX_VIDEO_DURATION_SEC + 0.001),
    ).toThrow(/duration exceeds/);
  });

  it('rejects an ffmpeg output that was silently shortened by the size cap', () => {
    expect(() => assertMatchingVideoDuration(300, 297)).not.toThrow();
    expect(() => assertMatchingVideoDuration(300, 296.9)).toThrow(/truncated/);
  });

  it('normalizes fractional probe duration to the integer Prisma contract', () => {
    expect(normalizeVideoDurationSec(3.456)).toBe(4);
    expect(Number.isInteger(normalizeVideoDurationSec(599.001))).toBe(true);
  });
});
