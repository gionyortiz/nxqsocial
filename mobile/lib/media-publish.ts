import { apiRequest } from './api';

export const VIDEO_SIZE_LIMIT = 200 * 1024 * 1024;
export const VIDEO_DURATION_LIMIT_MS = 10 * 60 * 1000;

export type UploadDraft = {
  fingerprint: string;
  mediaId: string;
  uploadUrl: string;
  expiresAt: number;
  transferred: boolean;
};
type MediaStatus = {
  uploadStatus: string;
  message?: string;
  postId?: string | null;
  storyId?: string | null;
};
type PublishOptions = {
  token: string;
  fingerprint: string;
  draft: { current: UploadDraft | null };
  mimeType: string;
  size: number;
  caption: string;
  visibility: string;
  isStory: boolean;
  transfer: (url: string) => Promise<void>;
  onStatus: (progress: number, message: string) => void;
};

/** Resume an owned upload after a lost response, without replaying mutations. */
export async function publishMedia(options: PublishOptions): Promise<void> {
  const { token, fingerprint, draft, mimeType, size, isStory, transfer, onStatus } = options;
  if (mimeType.startsWith('video/') && size > VIDEO_SIZE_LIMIT) {
    throw new Error('Video is too large. Choose a video under 200 MB.');
  }
  if (draft.current?.fingerprint !== fingerprint) draft.current = null;
  let status: MediaStatus | null = null;
  if (draft.current) {
    onStatus(15, 'Checking your saved upload...');
    status = await apiRequest<MediaStatus>(`/media/${draft.current.mediaId}/status`, { token });
    // An expired URL can be replaced only before finalization starts. The
    // server owns cleanup of abandoned objects; never delete an active scan.
    if (status.uploadStatus === 'PENDING' && !draft.current.transferred && draft.current.expiresAt <= Date.now()) {
      draft.current = null;
      status = null;
    }
  }
  if (!draft.current) {
    onStatus(15, 'Starting secure upload...');
    const target = await apiRequest<{ mediaId: string; uploadUrl: string; expiresIn: number }>('/media/create-upload-url', {
      method: 'POST', token, body: { mimeType, size },
    });
    if (!target.mediaId || !target.uploadUrl?.startsWith('https://')) {
      throw new Error('Secure upload could not start. Please try again.');
    }
    draft.current = {
      fingerprint, mediaId: target.mediaId, uploadUrl: target.uploadUrl,
      expiresAt: Date.now() + (target.expiresIn || 600) * 1000,
      transferred: false,
    };
    status = { uploadStatus: 'PENDING' };
  }
  const current = draft.current;
  if (status?.uploadStatus === 'PENDING') {
    if (!current.transferred) {
      onStatus(20, 'Uploading media...');
      await transfer(current.uploadUrl);
      current.transferred = true;
    }
    onStatus(75, 'Processing your upload...');
    // If the response is lost, the next user retry checks status first and
    // will not resubmit complete-upload once the server has accepted it.
    status = await apiRequest<MediaStatus>('/media/complete-upload', {
      method: 'POST', token, body: { mediaId: current.mediaId },
    });
  }
  for (let attempt = 0; attempt < 240; attempt++) {
    if (status?.uploadStatus === 'REJECTED') {
      throw new Error(status.message || 'Media was rejected by safety review.');
    }
    if (status?.uploadStatus === 'PUBLISHED') break;
    onStatus(88, status?.message || 'Processing video...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    // Only GET requests retry automatically. A transient poll failure keeps
    // current.mediaId so the next tap resumes without another paid scan.
    status = await apiRequest<MediaStatus>(`/media/${current.mediaId}/status`, { token });
  }
  if (status?.uploadStatus !== 'PUBLISHED') {
    throw new Error('Media is still processing. Retry to check this upload again.');
  }
  if (status.postId || status.storyId) {
    if ((isStory && status.storyId) || (!isStory && status.postId)) return;
    throw new Error('This media was already shared. Choose another file.');
  }
  onStatus(95, isStory ? 'Sharing to story...' : 'Publishing post...');
  await apiRequest(isStory ? '/stories' : '/posts', {
    method: 'POST', token,
    body: {
      caption: options.caption, visibility: options.visibility, mediaId: current.mediaId,
      ...(!isStory ? { type: mimeType.startsWith('video/') ? 'VIDEO' : 'PHOTO' } : {}),
    },
  });
}
