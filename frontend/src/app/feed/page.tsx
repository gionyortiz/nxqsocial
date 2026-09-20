'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PostCard } from '@/components/posts/PostCard';
import { ImmersiveVideoViewer } from '@/components/posts/ImmersiveVideoViewer';
import { StoriesBar } from '@/components/feed/StoriesBar';
import { RightSidebar } from '@/components/feed/RightSidebar';
import { LiveRail } from '@/components/live/LiveRail';
import { api } from '@/lib/api';
import {
  isCancelledFeedRequest,
  parseFeedPage,
  shouldRequestFeedPage,
} from '@/lib/feed-page-state';
import { useAuthStore } from '@/store/auth';
import { Avatar } from '@/components/ui/Avatar';
import Link from 'next/link';
import {
  AlertCircle,
  BookOpen,
  Camera,
  Clapperboard,
  Compass,
  PenSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';

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

function FeedSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your feed" className="flex flex-col gap-4">
      <span className="sr-only">Loading your feed</span>
      {Array.from({ length: 2 }).map((_, idx) => (
        <div key={idx} className="nxq-panel overflow-hidden p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 skeleton" style={{ borderRadius: '9999px' }} />
            <div className="flex-1">
              <div className="h-3.5 skeleton w-36 mb-2" />
              <div className="h-3 skeleton w-24" />
            </div>
          </div>
          <div className="skeleton h-56 sm:h-72" />
          <div className="mt-4 h-3.5 skeleton w-5/6" />
          <div className="mt-2 h-3.5 skeleton w-2/5" />
        </div>
      ))}
    </div>
  );
}

function FeedEmptyState() {
  return (
    <section className="nxq-panel relative overflow-hidden px-6 py-12 text-center sm:px-12" aria-labelledby="empty-feed-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(217,70,239,0.16),transparent_42%)]" />
      <div className="relative mx-auto max-w-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-fuchsia-300/20 bg-fuchsia-500/10 text-fuchsia-300 shadow-[0_12px_32px_rgba(217,70,239,0.14)]">
          <Sparkles size={25} aria-hidden="true" />
        </div>
        <p className="nxq-kicker">Make the space yours</p>
        <h2 id="empty-feed-title" className="mt-2 text-xl font-bold tracking-tight text-slate-50">
          Your feed is ready for your people.
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Follow creators you trust, explore new ideas, or start the conversation with your first post.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/search" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 transition-colors hover:border-fuchsia-400/30 hover:bg-white/[0.07]">
            <Compass size={16} aria-hidden="true" /> Explore people
          </Link>
          <Link href="/upload" className="btn-gradient inline-flex h-10 items-center justify-center gap-2 px-4 text-sm">
            <PenSquare size={16} aria-hidden="true" /> Create a post
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeedErrorState({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <section className="nxq-panel relative overflow-hidden border-rose-400/20 px-6 py-12 text-center sm:px-12" role="alert" aria-labelledby="feed-error-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(244,63,94,0.14),transparent_42%)]" />
      <div className="relative mx-auto max-w-md">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-500/10 text-rose-300">
          <AlertCircle size={25} aria-hidden="true" />
        </div>
        <p className="nxq-kicker text-rose-300">Feed unavailable</p>
        <h2 id="feed-error-title" className="mt-2 text-xl font-bold tracking-tight text-slate-50">
          We couldn&apos;t refresh your feed.
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Nothing has been lost. Try again when you&apos;re ready.
        </p>
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="btn-gradient mt-6 inline-flex h-10 items-center justify-center gap-2 px-4 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
          {retrying ? 'Refreshing…' : 'Try again'}
        </button>
      </div>
    </section>
  );
}

export default function FeedPage() {
  const { user } = useAuthStore();
  const [mode, setMode] = useState('FOR_YOU');
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [feedStatus, setFeedStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const loader = useRef<HTMLDivElement | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const requestInFlight = useRef(false);
  const hasMoreRef = useRef(true);

  const isVideoPost = (p: Post) =>
    (p.media?.[0]?.mimeType?.startsWith('video/') ?? false) || p.type === 'VIDEO' || p.type === 'SHORT_VIDEO';
  const videoPosts = posts.filter(isVideoPost);

  const openVideo = (postId: string) => {
    const idx = videoPosts.findIndex((p) => p.id === postId);
    if (idx >= 0) setViewerIndex(idx);
  };

  const fetchPosts = useCallback(async ({
    cursor: nextCursor,
    feedMode,
    reset,
  }: {
    cursor: string | null;
    feedMode: string;
    reset: boolean;
  }) => {
    if (!shouldRequestFeedPage({ inFlight: requestInFlight.current, hasMore: hasMoreRef.current, reset })) {
      return;
    }

    if (reset) {
      activeController.current?.abort();
      hasMoreRef.current = true;
      setHasMore(true);
      setCursor(null);
      setLoadMoreError(null);
      setFeedStatus('loading');
    }

    const controller = new AbortController();
    activeController.current = controller;
    const currentRequestId = ++requestId.current;
    requestInFlight.current = true;
    setLoading(true);
    try {
      const { data } = await api.get('/posts/feed', {
        params: { mode: feedMode, ...(nextCursor ? { cursor: nextCursor } : {}) },
        signal: controller.signal,
      });
      if (currentRequestId !== requestId.current) return;

      const page = parseFeedPage<Post>(data);
      setPosts((previousPosts) => (reset ? page.data : [...previousPosts, ...page.data]));
      setCursor(page.nextCursor);
      hasMoreRef.current = Boolean(page.nextCursor);
      setHasMore(Boolean(page.nextCursor));
      setFeedStatus('ready');
      setLoadMoreError(null);
    } catch (error) {
      if (currentRequestId !== requestId.current || isCancelledFeedRequest(error)) return;

      if (reset) {
        setPosts([]);
        setFeedStatus('error');
      } else {
        setLoadMoreError('More posts could not be loaded yet.');
      }
    } finally {
      if (currentRequestId === requestId.current) {
        requestInFlight.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPosts({ cursor: null, feedMode: mode, reset: true });
    }, 0);

    return () => {
      window.clearTimeout(timer);
      activeController.current?.abort();
    };
  }, [mode, fetchPosts]);

  useEffect(() => {
    if (!loader.current || loading || !hasMore || feedStatus === 'error') return;

    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        void fetchPosts({ cursor, feedMode: mode, reset: false });
      }
    }, { threshold: 0.1 });
    obs.observe(loader.current);
    return () => obs.disconnect();
  }, [cursor, feedStatus, hasMore, loading, fetchPosts, mode]);

  const retryFeed = () => {
    void fetchPosts({ cursor: null, feedMode: mode, reset: true });
  };

  const selectMode = (nextMode: string) => {
    if (nextMode === mode) return;
    setViewerIndex(null);
    setMode(nextMode);
  };

  return (
    <AppShell aside={<RightSidebar />}>
      <div className="px-2 py-5 sm:px-0 flex flex-col gap-4">
        <header className="flex items-end justify-between gap-4 px-1">
          <div>
            <p className="nxq-kicker">Your space</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-50">Your signal, your circle.</h1>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-fuchsia-300/15 bg-fuchsia-500/[0.07] px-3 py-1.5 text-xs font-semibold text-fuchsia-200">
            <ShieldCheck size={14} aria-hidden="true" /> Trust-first discovery
          </span>
        </header>

        {/* Create post */}
        <section className="nxq-panel relative overflow-hidden p-4 sm:p-5" aria-label="Create a post">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/50 to-transparent" />
          <div className="flex items-center gap-2.5">
            <Avatar src={user?.avatarUrl} alt={user?.username ?? 'You'} size="md" />
            <Link
              href="/upload"
              className="flex-1 h-11 rounded-xl border border-white/10 bg-[#090e17] px-4 flex items-center text-sm text-slate-400 transition-all hover:border-fuchsia-400/35 hover:bg-[#0c121d] hover:text-slate-200"
            >
              Share something worth seeing…
            </Link>
          </div>
          <div className="mt-3 pt-3 border-t border-[var(--border)] grid grid-cols-3 gap-2">
            <Link href="/upload" className="h-10 rounded-xl hover:bg-white/[0.05] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white transition-colors">
              <PenSquare size={16} className="text-fuchsia-400" /> Post
            </Link>
            <Link href="/upload" className="h-10 rounded-xl hover:bg-white/[0.05] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white transition-colors">
              <Camera size={16} className="text-fuchsia-400" /> Photo
            </Link>
            <Link href="/upload" className="h-10 rounded-xl hover:bg-white/[0.05] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white transition-colors">
              <Clapperboard size={16} className="text-fuchsia-400" /> Reel
            </Link>
          </div>
        </section>

        {/* Live now */}
        <LiveRail />

        {/* Stories */}
        <StoriesBar />

        {/* Feed mode tabs */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1" role="tablist" aria-label="Feed filters">
          {FEED_MODES.map((m) => {
            const ModeIcon = m.icon;
            return (
            <button
              type="button"
              key={m.key}
              id={`feed-mode-${m.key}`}
              onClick={() => selectMode(m.key)}
              role="tab"
              aria-selected={mode === m.key}
              aria-controls="feed-results"
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === m.key
                  ? 'bg-white/[0.09] text-white border border-fuchsia-300/20 shadow-[0_8px_24px_rgba(147,51,234,0.1)]'
                  : 'bg-transparent text-slate-500 border border-transparent hover:bg-white/[0.04] hover:text-slate-300'
              }`}
            >
              {ModeIcon && <ModeIcon size={14} />}
              {m.label}
            </button>
          )})}
        </div>

        <section id="feed-results" role="tabpanel" aria-labelledby={`feed-mode-${mode}`} aria-live="polite" className="flex flex-col gap-4">
          {feedStatus === 'loading' && posts.length === 0 && <FeedSkeleton />}
          {feedStatus === 'error' && posts.length === 0 && <FeedErrorState onRetry={retryFeed} retrying={loading} />}
          {feedStatus === 'ready' && posts.length === 0 && <FeedEmptyState />}

          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenVideo={openVideo}
              onDelete={(id) => setPosts((previousPosts) => previousPosts.filter((p) => p.id !== id))}
            />
          ))}

          <div ref={loader} className="min-h-10 py-2 flex flex-col items-center justify-center gap-2">
            {posts.length > 0 && loading && (
              <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" aria-label="Loading more posts" />
            )}
            {posts.length > 0 && loadMoreError && (
              <button
                type="button"
                onClick={() => void fetchPosts({ cursor, feedMode: mode, reset: false })}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-300/20 bg-rose-500/[0.08] px-3 py-2 text-xs font-semibold text-rose-200 transition-colors hover:bg-rose-500/[0.14]"
              >
                <RefreshCw size={14} aria-hidden="true" /> {loadMoreError} Retry
              </button>
            )}
            {posts.length > 0 && !hasMore && !loadMoreError && (
              <p className="text-xs font-medium text-slate-500">You&apos;re all caught up.</p>
            )}
          </div>
        </section>
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
