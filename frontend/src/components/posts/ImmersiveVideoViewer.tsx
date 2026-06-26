'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Heart, MessageCircle, X, VolumeX, Volume2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { EngagementListModal } from './EngagementListModal';
import { api } from '@/lib/api';
import { cn, formatCount } from '@/lib/utils';

interface MediaAsset { id: string; url: string; thumbnailUrl?: string; mimeType: string; }
interface VideoPost {
  id: string;
  caption?: string;
  isLiked: boolean;
  author: { id: string; username: string; displayName: string; avatarUrl?: string; verificationStatus: string };
  media: MediaAsset[];
  _count: { likes: number; comments: number };
}

const mediaBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000';
function resolveSrc(url?: string) {
  if (!url) return '';
  return url.startsWith('http') ? url : `${mediaBase}${url}`;
}

function ViewerItem({ post, active, muted, onToggleMute, onOpenEngagement }: {
  post: VideoPost; active: boolean; muted: boolean; onToggleMute: () => void; onOpenEngagement: (tab: 'likes' | 'comments') => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post._count.likes);
  const [playbackError, setPlaybackError] = useState(false);
  const firstMedia = post.media?.[0];
  const src = resolveSrc(firstMedia?.url);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.currentTime = 0;
      v.play().catch(() => {
        // iPhone Safari can fail playback for incompatible codecs.
        setPlaybackError(true);
      });
    }
    else v.pause();
  }, [active]);

  const toggleLike = async () => {
    setLiked((p) => !p);
    setLikeCount((c) => liked ? c - 1 : c + 1);
    try {
      const { data } = await api.post(`/posts/${post.id}/likes`);
      setLiked(data.liked);
      setLikeCount(data.count);
    } catch {
      setLiked((p) => !p);
      setLikeCount((c) => liked ? c + 1 : c - 1);
    }
  };

  return (
    <div className="relative w-full h-[100dvh] bg-black flex items-center justify-center snap-start snap-always shrink-0">
      {src && (
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-contain sm:object-cover"
          loop
          muted={muted}
          playsInline
          preload="metadata"
          onLoadedData={() => setPlaybackError(false)}
          onError={() => setPlaybackError(true)}
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            if (v.paused) {
              v.play().catch(() => {});
            } else {
              v.pause();
            }
          }}
          poster={firstMedia?.thumbnailUrl ?? undefined}
        />
      )}

      {playbackError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white">
          <p className="text-sm font-semibold">This video format is not supported on this device.</p>
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold"
          >
            Open original video
          </a>
        </div>
      )}

      {/* Mute toggle */}
      <button
        onClick={onToggleMute}
        className="absolute top-4 right-4 bg-black/40 rounded-full p-2 text-white"
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      {/* Right actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5">
        <button onClick={toggleLike} className="flex flex-col items-center gap-1">
          <Heart
            size={28}
            className={cn('transition-colors drop-shadow', liked ? 'text-red-500' : 'text-white')}
            fill={liked ? 'currentColor' : 'none'}
          />
        </button>
        <button type="button" onClick={() => onOpenEngagement('likes')} className="flex flex-col items-center gap-1 text-white">
          <span className="text-xs font-medium drop-shadow">{formatCount(likeCount)}</span>
        </button>
        <button type="button" onClick={() => onOpenEngagement('comments')} className="flex flex-col items-center gap-1 text-white">
          <MessageCircle size={28} className="drop-shadow" />
          <span className="text-xs font-medium drop-shadow">{formatCount(post._count.comments)}</span>
        </button>
      </div>

      {/* Author info */}
      <div className="absolute bottom-6 left-4 right-16 flex items-end gap-3">
        <Link href={`/profile/${post.author.username}`}>
          <Avatar src={post.author.avatarUrl} alt={post.author.username} size="sm" className="ring-2 ring-white flex-shrink-0" />
        </Link>
        <div>
          <div className="flex items-center gap-1">
            <Link href={`/profile/${post.author.username}`} className="text-white font-semibold text-sm drop-shadow">
              @{post.author.username}
            </Link>
            <TrustBadge status={post.author.verificationStatus} />
          </div>
          {post.caption && (
            <p className="text-white/80 text-xs mt-0.5 line-clamp-2 drop-shadow">{post.caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function ImmersiveVideoViewer({ posts, startIndex, onClose }: {
  posts: VideoPost[]; startIndex: number; onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(startIndex);
  const [muted, setMuted] = useState(true);
  const [engagementTab, setEngagementTab] = useState<{ postId: string; tab: 'likes' | 'comments' } | null>(null);

  // Jump to the tapped video on open
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: startIndex * el.clientHeight, behavior: 'auto' });
  }, [startIndex]);

  // Track which video is in view
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const items = Array.from(el.querySelectorAll('[data-viewer-index]'));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            setActiveIndex(Number((entry.target as HTMLElement).dataset.viewerIndex));
          }
        }
      },
      { root: el, threshold: [0.6] },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [posts]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] bg-black">
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-10 bg-black/40 rounded-full p-2 text-white"
        aria-label="Close"
      >
        <X size={22} />
      </button>
      <div
        ref={containerRef}
        className="h-[100dvh] overflow-y-scroll snap-y snap-mandatory overscroll-y-contain"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {posts.map((post, i) => (
          <div key={post.id} data-viewer-index={i} className="h-[100dvh] w-full">
            <ViewerItem
              post={post}
              active={i === activeIndex}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onOpenEngagement={(tab) => setEngagementTab({ postId: post.id, tab })}
            />
          </div>
        ))}
      </div>

      {engagementTab && (
        <EngagementListModal
          postId={engagementTab.postId}
          initialTab={engagementTab.tab}
          onClose={() => setEngagementTab(null)}
        />
      )}
    </div>
  );
}
