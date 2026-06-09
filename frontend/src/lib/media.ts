import { api } from './api';

export type UploadStatus = 'PENDING' | 'SCANNING' | 'PUBLISHED' | 'REJECTED';

export interface CreateUploadUrlResponse {
  uploadUrl: string;
  mediaId: string;
  s3Key: string;
  expiresIn: number;
}

export interface CompleteUploadResponse {
  id: string;
  uploadStatus: UploadStatus;
  url: string | null;
  message?: string;
}

export interface MediaStatusResponse {
  id: string;
  uploadStatus: UploadStatus;
  url: string | null;
  mimeType: string;
  size: number;
  moderationStatus?: string;
  message?: string;
}

/** Request a presigned S3 PUT URL for direct-client upload. */
export async function createUploadUrl(
  mimeType: string,
  size: number,
): Promise<CreateUploadUrlResponse> {
  const { data } = await api.post<CreateUploadUrlResponse>(
    '/media/create-upload-url',
    { mimeType, size },
  );
  return data;
}

/**
 * Upload a file directly to S3 using a presigned URL.
 * Calls onProgress(0–100) as the upload progresses.
 */
export function uploadToS3(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.send(file);
  });
}

/** Notify the backend the upload is complete and trigger safety scan. */
export async function completeUpload(mediaId: string): Promise<CompleteUploadResponse> {
  const { data } = await api.post<CompleteUploadResponse>('/media/complete-upload', { mediaId });
  return data;
}

/** Poll for the current status of a media asset. */
export async function getMediaStatus(mediaId: string): Promise<MediaStatusResponse> {
  const { data } = await api.get<MediaStatusResponse>(`/media/${mediaId}/status`);
  return data;
}

export async function removeMedia(mediaId: string): Promise<void> {
  await api.delete(`/media/${mediaId}`);
}

/**
 * Full upload pipeline:
 * 1. Create presigned URL
 * 2. PUT file directly to S3 with progress tracking
 * 3. Notify backend (triggers safety scan)
 *
 * Returns the complete-upload response which contains uploadStatus.
 */
export async function runUploadPipeline(
  file: File,
  onProgress: (pct: number) => void,
): Promise<CompleteUploadResponse> {
  const { uploadUrl, mediaId } = await createUploadUrl(file.type, file.size);
  await uploadToS3(uploadUrl, file, onProgress);
  return completeUpload(mediaId);
}
