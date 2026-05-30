'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, ImageIcon, Film, X, CheckCircle, Clock, Shield, AlertCircle, Globe, Users, Lock, Lightbulb } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { runUploadPipeline, getMediaStatus } from '@/lib/media';

type Phase =
  | 'idle'        // no file chosen
  | 'preview'     // file chosen, waiting for user to click Upload
  | 'uploading'   // PUT to S3 in progress
  | 'scanning'    // backend safety scan (video async)
  | 'ready'       // uploadStatus === PUBLISHED, waiting for caption
  | 'posting'     // POST /posts in progress
  | 'done'        // post created, redirecting
  | 'rejected'    // media rejected by safety scanner
  | 'error';      // network / server error

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
];
const MAX_IMAGE = 10 * 1024 * 1024;   // 10 MB
const MAX_VIDEO = 200 * 1024 * 1024;  // 200 MB

type Audience = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
const AUDIENCES: { value: Audience; label: string; desc: string; icon: typeof Globe }[] = [
  { value: 'PUBLIC', label: 'Public', desc: 'Anyone on NXQ', icon: Globe },
  { value: 'FOLLOWERS', label: 'Followers', desc: 'Only your followers', icon: Users },
  { value: 'PRIVATE', label: 'Only me', desc: 'Visible to you only', icon: Lock },
];

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

const POSTING_TIPS = [
  'Write a clear caption — posts with context get more engagement.',
  'Verified creators earn more trust and reach.',
  'Family-safe content is prioritized in discovery.',
  'High-quality images and videos perform best.',
];

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<Audience>('PUBLIC');
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const isVideo = file?.type.startsWith('video/');

  const pickFile = useCallback((f: File) => {
    if (!ALLOWED_MIME.includes(f.type)) {
      setError('Unsupported file type. Use JPEG, PNG, WebP, GIF, MP4, WebM or MOV.');
      return;
    }
    const limit = f.type.startsWith('video/') ? MAX_VIDEO : MAX_IMAGE;
    if (f.size > limit) {
      const mb = limit / 1024 / 1024;
      setError(`File is too large. Limit is ${mb} MB for ${f.type.startsWith('video/') ? 'videos' : 'images'}.`);
      return;
    }
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setPhase('preview');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, [pickFile]);

  const reset = useCallback(() => {
    setFile(null);
    setPreview(null);
    setPhase('idle');
    setProgress(0);
    setMediaId(null);
    setError('');
    setCaption('');
  }, []);

  const pollUntilReady = useCallback(async (id: string) => {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const status = await getMediaStatus(id);
        if (status.uploadStatus === 'PUBLISHED') { setPhase('ready'); return; }
        if (status.uploadStatus === 'REJECTED') { setPhase('rejected'); return; }
      } catch { /* keep polling */ }
    }
    // Timeout — treat as ready (scan continues server-side)
    setPhase('ready');
  }, []);

  const startUpload = async () => {
    if (!file) return;
    setError('');
    setPhase('uploading');
    setProgress(0);
    try {
      const result = await runUploadPipeline(file, (pct) => setProgress(pct));
      setMediaId(result.id);

      if (result.uploadStatus === 'REJECTED') {
        setPhase('rejected');
        return;
      }
      if (result.uploadStatus === 'SCANNING') {
        setPhase('scanning');
        await pollUntilReady(result.id);
        return;
      }
      setPhase('ready');
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Upload failed');
      setPhase('error');
    }
  };

  const sharePost = async () => {
    if (!mediaId) return;
    setError('');
    setPhase('posting');
    try {
      await api.post('/posts', {
        mediaId,
        caption: caption || undefined,
        type: isVideo ? 'VIDEO' : 'PHOTO',
        visibility: audience,
      });
      setPhase('done');
      setTimeout(() => router.push('/feed'), 1500);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create post');
      setPhase('ready');
    }
  };

  const selectedAudience = AUDIENCES.find((a) => a.value === audience)!;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-gray-900">Create new post</h1>
          <p className="text-sm text-gray-500 mt-0.5">Share a photo or video with your community.</p>
        </div>

        <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
          {/* ── Main composer column ── */}
          <div className="rounded-3xl ring-1 ring-gray-100 bg-white shadow-[0_8px_40px_-16px_rgba(124,58,237,0.2)] p-5 sm:p-6">

        {/* ── IDLE: file picker ── */}
        {phase === 'idle' && (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className="border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-4 py-20 cursor-pointer hover:border-purple-400 hover:bg-purple-50/50 transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
                <Upload size={28} className="text-purple-500" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-700">Drag photo or video here</p>
                <p className="text-sm text-purple-600 font-medium mt-1">or browse files</p>
                <p className="text-xs text-gray-300 mt-3">
                  JPEG · PNG · WebP · GIF up to 10 MB<br />
                  MP4 · WebM · MOV up to 200 MB
                </p>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED_MIME.join(',')}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
            />
            {error && (
              <div className="flex items-center gap-2 mt-3 text-sm text-red-500">
                <AlertCircle size={15} />
                {error}
              </div>
            )}
          </>
        )}

        {/* ── All non-idle phases: show preview + controls ── */}
        {phase !== 'idle' && preview && (
          <div className="space-y-4">
            {/* Media preview */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
              {isVideo ? (
                <video src={preview} className="w-full h-full object-contain" controls />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="preview" className="w-full h-full object-contain" />
              )}
              {phase === 'preview' && (
                <button
                  onClick={reset}
                  className="absolute top-3 right-3 bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80"
                  aria-label="Remove file"
                >
                  <X size={16} />
                </button>
              )}
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1 text-white text-xs">
                {isVideo ? <Film size={12} /> : <ImageIcon size={12} />}
                {isVideo ? 'Video' : 'Photo'}
              </div>
            </div>

            {/* File metadata */}
            {file && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span className="font-medium text-gray-700 truncate max-w-[55%]">{file.name}</span>
                <span>{formatBytes(file.size)}</span>
                <span className="uppercase">{file.type.split('/')[1]}</span>
              </div>
            )}

            {/* Progress bar (uploading / scanning) */}
            {(phase === 'uploading' || phase === 'scanning') && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>{phase === 'uploading' ? 'Uploading…' : 'Scanning for safety…'}</span>
                  {phase === 'uploading' && <span>{progress}%</span>}
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      phase === 'uploading'
                        ? 'bg-purple-500'
                        : 'bg-amber-400 animate-pulse w-full',
                    )}
                    style={phase === 'uploading' ? { width: `${progress}%` } : undefined}
                  />
                </div>
              </div>
            )}

            {/* Status messages */}
            {phase === 'ready' && (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <CheckCircle size={16} /> Ready to post
              </div>
            )}
            {phase === 'scanning' && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <Clock size={16} /> Processing video…
              </div>
            )}
            {phase === 'rejected' && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <Shield size={16} />
                This media was flagged and cannot be posted.
                <button onClick={reset} className="underline ml-1 hover:text-red-700">
                  Try another file
                </button>
              </div>
            )}
            {phase === 'done' && (
              <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                <CheckCircle size={16} /> Posted! Redirecting to feed…
              </div>
            )}
            {(phase === 'error') && error && (
              <div className="flex items-center gap-2 text-sm text-red-500">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            {/* Caption textarea (shown when interactable) */}
            {(phase === 'preview' || phase === 'ready' || phase === 'posting') && (
              <div>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Write a caption… (optional)"
                  maxLength={2200}
                  rows={3}
                  disabled={phase !== 'preview' && phase !== 'ready'}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-400"
                />
                <p className="text-xs text-gray-400 text-right">{caption.length}/2200</p>
              </div>
            )}

            {/* Audience selector */}
            {(phase === 'preview' || phase === 'ready' || phase === 'posting') && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Audience</p>
                <div className="grid grid-cols-3 gap-2">
                  {AUDIENCES.map((a) => {
                    const Icon = a.icon;
                    const active = audience === a.value;
                    return (
                      <button
                        key={a.value}
                        type="button"
                        disabled={phase !== 'preview' && phase !== 'ready'}
                        onClick={() => setAudience(a.value)}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-center transition-all disabled:opacity-60',
                          active
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300',
                        )}
                      >
                        <Icon size={16} className={active ? 'text-purple-600' : 'text-gray-400'} />
                        <span className={cn('text-xs font-semibold', active ? 'text-purple-700' : 'text-gray-600')}>{a.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">{selectedAudience.desc}</p>
              </div>
            )}

            {/* CTA buttons */}
            {phase === 'preview' && (
              <Button onClick={startUpload} size="lg" className="w-full">
                Upload
              </Button>
            )}
            {phase === 'ready' && (
              <Button onClick={sharePost} size="lg" className="w-full">
                Share Post
              </Button>
            )}
            {phase === 'posting' && (
              <Button disabled size="lg" className="w-full opacity-60">
                Posting…
              </Button>
            )}
            {phase === 'error' && (
              <Button onClick={reset} size="lg" variant="secondary" className="w-full">
                Try Again
              </Button>
            )}
          </div>
        )}
          </div>

          {/* ── Sidebar: trust & safety + tips ── */}
          <div className="space-y-4 lg:sticky lg:top-6">
            {/* Trust & Safety */}
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={15} className="text-purple-500" />
                <h3 className="text-sm font-bold text-gray-900">Trust &amp; Safety</h3>
              </div>
              {phase === 'scanning' && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600"><Clock size={13} /> Scanning your media…</p>
              )}
              {phase === 'ready' && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600"><CheckCircle size={13} /> Approved — ready to share</p>
              )}
              {phase === 'rejected' && (
                <p className="flex items-center gap-1.5 text-xs text-red-600"><AlertCircle size={13} /> Flagged — cannot be posted</p>
              )}
              {phase !== 'scanning' && phase !== 'ready' && phase !== 'rejected' && (
                <p className="text-xs text-gray-500 leading-relaxed">Every upload is automatically scanned for safety before it goes live. This keeps NXQ Social trusted and bot-free.</p>
              )}
            </div>

            {/* Posting tips */}
            <div className="rounded-2xl ring-1 ring-purple-100 bg-gradient-to-br from-purple-50/60 to-white p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Lightbulb size={15} className="text-purple-500" />
                <h3 className="text-sm font-bold text-gray-900">Posting tips</h3>
              </div>
              <ul className="space-y-2">
                {POSTING_TIPS.map((tip) => (
                  <li key={tip} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

