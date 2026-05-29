'use client';

import { useEffect, useState, useRef } from 'react';
import { Heart, MessageCircle, VolumeX, Volume2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { AppShell } from '@/components/layout/AppShell';
import { api } from '@/lib/api';
import { cn, formatCount } from '@/lib/utils';

interface MediaAsset { id: string; url: string; mimeType: string; thumbnailUrl?: string; }
interface Reel {
  id: string;
  caption?: string;
  type: string;
  createdAt: string;
  isLiked: boolean;
  author: { id: string; username: string; displayName: string; avatarUrl?: string; verificationStatus: string };
  media: MediaAsset[];
  _count: { likes: number; comments: number };
}

function ReelItem({ reel, active }: { reel: Reel; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liked, setLiked] = useState(reel.isLiked);
  const [likeCount, setLikeCount] = useState(reel._count.likes);
  const [muted, setMuted] = useState(true);
  const mediaBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000';
  const firstMedia = reel.media?.[0];
  const src = firstMedia ? (firstMedia.url.startsWith('http') ? firstMedia.url : `${mediaBase}${firstMedia.url}`) : '';

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) { v.currentTime = 0; v.play().catch(() => {}); }
    else v.pause();
  }, [active]);

  const toggleLike = async () => {
    setLiked((p) => !p);
    setLikeCount((c) => liked ? c - 1 : c + 1);
    try {
      const { data } = await api.post(`/likes/${reel.id}`);
      setLiked(data.liked);
      setLikeCount(data.count);
    } catch {
      setLiked((p) => !p);
      setLikeCount((c) => liked ? c + 1 : c - 1);
    }
  };

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center snap-start">
      {src && (
        <video
          ref={videoRef}
          src={src}
          className="h-full w-full object-cover"
          loop
          muted={muted}
          playsInline
          poster={firstMedia?.thumbnailUrl ?? undefined}
        />
      )}

      {/* Mute toggle */}
      <button
        onClick={() => setMuted((m) => !m)}
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
          <span className="text-white text-xs font-medium drop-shadow">{formatCount(likeCount)}</span>
        </button>
        <div className="flex flex-col items-center gap-1 text-white">
          <MessageCircle size={28} className="drop-shadow" />
          <span className="text-xs font-medium drop-shadow">{formatCount(reel._count.comments)}</span>
        </div>
      </div>

      {/* Author info */}
      <div className="absolute bottom-6 left-4 right-16 flex items-end gap-3">
        <Avatar src={reel.author.avatarUrl} alt={reel.author.username} size="sm" className="ring-2 ring-white flex-shrink-0" />
        <div>
          <div className="flex items-center gap-1">
            <span className="text-white font-semibold text-sm drop-shadow">@{reel.author.username}</span>
            <TrustBadge status={reel.author.verificationStatus} />
          </div>
          {reel.caption && (
            <p className="text-white/80 text-xs mt-0.5 line-clamp-2 drop-shadow">{reel.caption}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReelsPage() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/posts/reels').then(({ data }) => setReels(data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollTop / el.clientHeight);
      setActiveIndex(idx);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <AppShell>
      <div
        ref={containerRef}
        className="h-screen overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {reels.length === 0 && (
          <div className="h-screen flex items-center justify-center bg-black text-white">
            <p className="text-gray-400">No reels yet. Upload a video!</p>
          </div>
        )}
        {reels.map((reel, i) => (
          <div key={reel.id} className="h-screen w-full">
            <ReelItem reel={reel} active={i === activeIndex} />
          </div>
        ))}
      </div>
    </AppShell>
  );
}
