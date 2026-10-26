import { apiRequest } from '../lib/api';
import { publishMedia, UploadDraft, VIDEO_SIZE_LIMIT } from '../lib/media-publish';

jest.mock('../lib/api', () => ({ apiRequest: jest.fn() }));
const request = apiRequest as jest.Mock;
const target = { mediaId: 'fixture-media', uploadUrl: 'https://storage.example.invalid/fixture', expiresIn: 600 };
const published = { uploadStatus: 'PUBLISHED', postId: null, storyId: null };
function fixture() {
  return {
    token: 'fixture-token', fingerprint: 'fixture-file',
    draft: { current: null as UploadDraft | null },
    mimeType: 'video/mp4', size: 100, caption: 'Fixture', visibility: 'PRIVATE', isStory: false,
    transfer: jest.fn().mockResolvedValue(undefined), onStatus: jest.fn(),
  };
}
beforeEach(() => { jest.clearAllMocks(); });

test('publishes a transferred and approved video once', async () => {
  const options = fixture();
  request.mockResolvedValueOnce(target).mockResolvedValueOnce(published).mockResolvedValueOnce({ id: 'fixture-post' });
  await publishMedia(options);
  expect(options.transfer).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.map(call => call[0])).toEqual(['/media/create-upload-url', '/media/complete-upload', '/posts']);
  expect(request.mock.calls[2][1].body).toEqual({ caption: 'Fixture', visibility: 'PRIVATE', mediaId: 'fixture-media', type: 'VIDEO' });
});

test('lost finalization response resumes the approved asset without another upload or scan', async () => {
  const options = fixture();
  request.mockResolvedValueOnce(target).mockRejectedValueOnce(new Error('Network request failed'));
  await expect(publishMedia(options)).rejects.toThrow('Network request failed');
  expect(options.draft.current?.transferred).toBe(true);
  request.mockResolvedValueOnce(published).mockResolvedValueOnce({ id: 'fixture-post' });
  await publishMedia(options);
  expect(options.transfer).toHaveBeenCalledTimes(1);
  expect(request.mock.calls.filter(call => call[0] === '/media/complete-upload')).toHaveLength(1);
  expect(request.mock.calls.filter(call => call[0] === '/media/create-upload-url')).toHaveLength(1);
});

test('lost publication response checks attachment and does not create a duplicate post', async () => {
  const options = fixture();
  request.mockResolvedValueOnce(target).mockResolvedValueOnce(published).mockRejectedValueOnce(new Error('Network request failed'));
  await expect(publishMedia(options)).rejects.toThrow();
  request.mockResolvedValueOnce({ ...published, postId: 'fixture-post' });
  await publishMedia(options);
  expect(request.mock.calls.filter(call => call[0] === '/posts')).toHaveLength(1);
  expect(options.transfer).toHaveBeenCalledTimes(1);
});

test('failed transfer reuses its unexpired URL instead of consuming another upload allowance', async () => {
  const options = fixture();
  options.transfer.mockRejectedValueOnce(new Error('Network request failed'));
  request.mockResolvedValueOnce(target);
  await expect(publishMedia(options)).rejects.toThrow();
  request.mockResolvedValueOnce({ uploadStatus: 'PENDING' }).mockResolvedValueOnce(published).mockResolvedValueOnce({});
  await publishMedia(options);
  expect(options.transfer).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.filter(call => call[0] === '/media/create-upload-url')).toHaveLength(1);
});

test('a poll outage retains the draft and cannot replay completion', async () => {
  jest.useFakeTimers();
  try {
    const options = fixture();
    request.mockResolvedValueOnce(target).mockResolvedValueOnce({ uploadStatus: 'SCANNING' }).mockRejectedValueOnce(new Error('Connection failed'));
    const attempt = expect(publishMedia(options)).rejects.toThrow('Connection failed');
    await jest.runAllTimersAsync();
    await attempt;
    request.mockResolvedValueOnce(published).mockResolvedValueOnce({});
    await publishMedia(options);
    expect(options.transfer).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.filter(call => call[0] === '/media/complete-upload')).toHaveLength(1);
  } finally { jest.useRealTimers(); }
});

test('does not publish rejected media or replay it on retry', async () => {
  const options = fixture();
  request.mockResolvedValueOnce(target).mockResolvedValueOnce({ uploadStatus: 'REJECTED' });
  await expect(publishMedia(options)).rejects.toThrow('rejected');
  request.mockResolvedValueOnce({ uploadStatus: 'REJECTED' });
  await expect(publishMedia(options)).rejects.toThrow('rejected');
  expect(request.mock.calls.some(call => call[0] === '/posts')).toBe(false);
  expect(options.transfer).toHaveBeenCalledTimes(1);
});

test('validates video size before requesting storage or consuming quota', async () => {
  await expect(publishMedia({ ...fixture(), size: VIDEO_SIZE_LIMIT + 1 })).rejects.toThrow('200 MB');
  expect(request).not.toHaveBeenCalled();
});

test('quota rejection does not transfer or publish media', async () => {
  const options = fixture();
  request.mockRejectedValueOnce(new Error('Monthly media review capacity has been reached'));
  await expect(publishMedia(options)).rejects.toThrow('Monthly media review capacity');
  expect(options.transfer).not.toHaveBeenCalled();
  expect(options.draft.current).toBeNull();
});
