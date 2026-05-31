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
import { Camera, Clapperboard, PenSquare } from 'lucide-react';

const FEED_MODES = [
  { key: 'FOR_YOU',         label: 'For You' },
  { key: 'FOLLOWING',       label: 'Following' },
  { key: 'VERIFIED_HUMANS', label: '✓ Verified' },
  { key: 'FAMILY_SAFE',     label: '🏠 Safe' },
  { key: 'LEARNING',        label: '📚 Learn' },
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

  const fetchPosts = useCallback(async (c?: string | null, feedMode = mode) => {
    if (loading || (!hasMore && c !== undefined)) return;
    setLoading(true);
    try {
      const { data } = await api.get('/posts/feed', { params: { mode: feedMode, ...(c ? { cursor: c } : {}) } });
      setPosts((prev) => c ? [...prev, ...data.data] : data.data);
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } catch {
      // silently – may not be logged in yet
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, mode]);

  useEffect(() => {
    setPosts([]);
    setCursor(null);
    setHasMore(true);
    fetchPosts(null, mode);
  }, [mode]);

  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasMore && !loading) fetchPosts(cursor);
    }, { threshold: 0.1 });
    if (loader.current) obs.observe(loader.current);
    return () => obs.disconnect();
  }, [cursor, hasMore, loading, fetchPosts]);

  return (
    <AppShell aside={<RightSidebar />}>
      <div className="px-3 sm:px-4 py-4 flex flex-col gap-3.5">
        {/* Create post */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
          <div className="flex items-center gap-2.5">
            <Avatar src={user?.avatarUrl} alt={user?.username ?? 'You'} size="md" />
            <Link
              href="/upload"
              className="flex-1 h-11 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors px-4 flex items-center text-sm text-gray-500"
            >
              What's on your mind?
            </Link>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-2">
            <Link href="/upload" className="h-9 rounded-xl hover:bg-purple-50 flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700">
              <PenSquare size={16} className="text-purple-600" /> Post
            </Link>
            <Link href="/upload" className="h-9 rounded-xl hover:bg-purple-50 flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700">
              <Camera size={16} className="text-purple-600" /> Photo
            </Link>
            <Link href="/upload" className="h-9 rounded-xl hover:bg-purple-50 flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-700">
              <Clapperboard size={16} className="text-purple-600" /> Reel
            </Link>
          </div>
        </div>

        {/* Live now */}
        <LiveRail />

        {/* Stories */}
        <StoriesBar />

        {/* Feed mode tabs */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {FEED_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                mode === m.key
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {posts.length === 0 && loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200" />
                  <div className="flex-1">
                    <div className="h-3.5 bg-gray-200 rounded w-32 mb-1.5" />
                    <div className="h-3 bg-gray-100 rounded w-24" />
                  </div>
                </div>
                <div className="rounded-2xl bg-gray-100 h-72" />
                <div className="mt-3 h-3.5 bg-gray-100 rounded w-5/6" />
              </div>
            ))}
          </div>
        )}

        {posts.length === 0 && !loading && (
          <div className="text-center py-14 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
            <p className="text-lg font-semibold text-gray-700">Your feed is warming up</p>
            <p className="text-sm mt-1">Follow more people or share your first post to increase feed density.</p>
            <div className="mt-4">
              <Link href="/upload" className="inline-flex items-center px-4 h-10 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white text-sm font-semibold">
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
