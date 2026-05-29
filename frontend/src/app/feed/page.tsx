'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/posts/PostCard';
import { api } from '@/lib/api';

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
  const [mode, setMode] = useState('FOR_YOU');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loader = useRef<HTMLDivElement | null>(null);

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
    <AppShell>
      <div className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Feed mode tabs */}
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
          {FEED_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                mode === m.key
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {posts.length === 0 && !loading && (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg font-medium">No posts yet</p>
            <p className="text-sm mt-1">Follow people or upload your first post</p>
          </div>
        )}

        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}

        <div ref={loader} className="py-4 flex justify-center">
          {loading && (
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>
    </AppShell>
  );
}
