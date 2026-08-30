'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/posts/PostCard';
import { ImmersiveVideoViewer } from '@/components/posts/ImmersiveVideoViewer';
import { StoriesBar } from '@/components/feed/StoriesBar';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { LiveRail } from '@/components/live/LiveRail';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar } from '@/components/ui/Avatar';
import Link from 'next/link';
import { BookOpen, Camera, Clapperboard, PenSquare, ShieldCheck, Users } from 'lucide-react';

const FEED_MODES = [
  { key: 'FOR_YOU',         label: 'For You', icon: null },
  { key: 'FOLLOWING',       label: 'Following', icon: Users },
  { key: 'VERIFIED_HUMANS', label: 'Verified', icon: ShieldCheck },
  { key: 'FAMILY_SAFE',     label: 'Safe', icon: ShieldCheck },
  { key: 'LEARNING',        label: 'Learn', icon: BookOpen },
];

interface MediaAsset { id: string; url: string; thumbnailUrl?: string; mimeType: string; }
interface Post {
  id: string;
  caption?: string;
  type: string;
  aiLabel?: string;
  createdAt: string;
  isLiked: boolean;
  author: { id: string; username: string; displayName: string; avatarUrl?: string; verificationStatus: string; trustScore: number };
  media: MediaAsset[];
  _count: { likes: number; comments: number };
}

export default function FeedPage() {
  const { user } = useAuthStore();
  const [mode, setMode] = useState('FOR_YOU');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const loader = useRef<HTMLDivElement | null>(null);

  const isVideoPost = (p: Post) =>
    (p.media?.[0]?.mimeType?.startsWith('video/') ?? false) || p.type === 'VIDEO' || p.type === 'SHORT_VIDEO';
  const videoPosts = posts.filter(isVideoPost);

  const openVideo = (postId: string) => {
    const idx = videoPosts.findIndex((p) => p.id === postId);
    if (idx >= 0) setViewerIndex(idx);
  };

  const fetchPosts = useCallback(async (c?: string | null, feedMode = mode, reset = false) => {
    if (loading || (!hasMore && c !== undefined && !reset)) return;
    setLoading(true);
    try {
      const { data } = await api.get('/posts/feed', { params: { mode: feedMode, ...(c ? { cursor: c } : {}) } });
      setPosts((prev) => (reset ? data.data : c ? [...prev, ...data.data] : data.data));
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } catch {
      // silently – may not be logged in yet
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, mode]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void fetchPosts(null, mode, true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [mode, fetchPosts]);

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) fetchPosts(cursor);
    }, { threshold: 0.1 });
    if (loader.current) obs.observe(loader.current);
    return () => obs.disconnect();
  }, [cursor, hasMore, loading, fetchPosts]);

  return (
    <AppShell aside={<RightSidebar />}>
      <div className="px-2 sm:px-0 py-5 flex flex-col gap-4">
        {/* Create post */}
        <div className="nxq-panel p-4">
          <div className="flex items-center gap-2.5">
            <Avatar src={user?.avatarUrl} alt={user?.username ?? 'You'} size="md" />
            <Link
              href="/upload"
              className="flex-1 h-11 rounded-xl border border-white/10 bg-[#090e17] hover:border-fuchsia-500/30 hover:bg-[#0c121d] transition-colors px-4 flex items-center text-sm text-slate-500"
            >
              What&apos;s on your mind?
            </Link>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2">
            <Link href="/upload" className="h-9 rounded-lg hover:bg-white/[0.05] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white">
              <PenSquare size={16} className="text-fuchsia-400" /> Post
            </Link>
            <Link href="/upload" className="h-9 rounded-lg hover:bg-white/[0.05] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white">
              <Camera size={16} className="text-fuchsia-400" /> Photo
            </Link>
            <Link href="/upload" className="h-9 rounded-lg hover:bg-white/[0.05] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white">
              <Clapperboard size={16} className="text-fuchsia-400" /> Reel
            </Link>
          </div>
        </div>

        {/* Live now */}
        <LiveRail />

        {/* Stories */}
        <StoriesBar />

        {/* Feed mode tabs */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {FEED_MODES.map((m) => {
            const ModeIcon = m.icon;
            return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                mode === m.key
                  ? 'bg-white/[0.09] text-white border border-white/10'
                  : 'bg-transparent text-slate-500 border border-transparent hover:bg-white/[0.04] hover:text-slate-300'
              }`}
            >
              {ModeIcon && <ModeIcon size={14} />}
              {m.label}
            </button>
          )})}
        </div>

        {posts.length === 0 && loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="nxq-panel p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 skeleton" style={{ borderRadius: '9999px' }} />
                  <div className="flex-1">
                    <div className="h-3.5 skeleton w-32 mb-1.5" />
                    <div className="h-3 skeleton w-24" />
                  </div>
                </div>
                <div className="skeleton h-72" />
                <div className="mt-3 h-3.5 skeleton w-5/6" />
              </div>
            ))}
          </div>
        )}

        {posts.length === 0 && !loading && (
          <div className="text-center py-14 text-slate-500 nxq-panel border-dashed">
            <p className="text-lg font-semibold text-slate-200">Your feed is warming up</p>
            <p className="text-sm mt-1">Follow more people or share your first post to increase feed density.</p>
            <div className="mt-4">
              <Link href="/upload" className="inline-flex items-center px-4 h-10 btn-gradient text-sm">
                Create a post
              </Link>
            </div>
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenVideo={openVideo}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}

        <div ref={loader} className="py-4 flex justify-center">
          {loading && (
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {viewerIndex !== null && (
        <ImmersiveVideoViewer
          posts={videoPosts}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </AppShell>
  );
}
