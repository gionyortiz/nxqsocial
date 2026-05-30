'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Sparkles, ShieldCheck, Heart, MessageCircle, Film, Compass, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCount, resolveMediaUrl } from '@/lib/utils';

interface UserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  verificationStatus: string;
  trustScore: number;
}

interface MediaAsset { url: string; mimeType: string; }
interface ExplorePost {
  id: string;
  type: string;
  caption?: string;
  media: MediaAsset[];
  author: { username: string; displayName: string; verificationStatus: string };
  _count: { likes: number; comments: number };
}

const TRENDING = ['#NexaQuantum', '#VerifiedHuman', '#TrustFirst', '#NoBots', '#FamilySafe', '#AI', '#Space'];

function withMedia(posts: ExplorePost[]) {
  return posts.filter((p) => p.media?.length > 0);
}

export default function ExplorePage() {
  const { user: me } = useAuthStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [creators, setCreators] = useState<UserResult[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [explore, setExplore] = useState<ExplorePost[]>([]);
  const [verified, setVerified] = useState<ExplorePost[]>([]);
  const [familySafe, setFamilySafe] = useState<ExplorePost[]>([]);
  const [loading, setLoading] = useState(true);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/users/search', { params: { q: '' } }).then((r) => r.data).catch(() => []),
      api.get('/posts/feed', { params: { mode: 'FOR_YOU' } }).then((r) => r.data?.data ?? []).catch(() => []),
      api.get('/posts/feed', { params: { mode: 'VERIFIED_HUMANS' } }).then((r) => r.data?.data ?? []).catch(() => []),
      api.get('/posts/feed', { params: { mode: 'FAMILY_SAFE' } }).then((r) => r.data?.data ?? []).catch(() => []),
    ])
      .then(([users, forYou, verifiedPosts, safePosts]) => {
        const list: UserResult[] = Array.isArray(users) ? users : [];
        setCreators(
          list
            .filter((u) => u.username !== me?.username)
            .sort((a, b) => b.trustScore - a.trustScore)
            .slice(0, 8),
        );
        setExplore(withMedia(forYou));
        setVerified(withMedia(verifiedPosts));
        setFamilySafe(withMedia(safePosts));
      })
      .finally(() => setLoading(false));
  }, [me?.username]);

  const onSearch = (q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/users/search', { params: { q } });
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const follow = async (username: string) => {
    setFollowed((f) => ({ ...f, [username]: true }));
    try {
      await api.post(`/users/${username}/follow`);
    } catch {
      setFollowed((f) => ({ ...f, [username]: false }));
    }
  };

  const searchActive = query.trim().length > 0;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Compass size={24} className="text-purple-500" /> Explore
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Discover trusted people and content on NXQ Social.</p>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search people…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* ── Search results mode ── */}
        {searchActive ? (
          <div className="flex flex-col gap-3">
            {searching && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {results.map((u) => (
              <Link
                key={u.id}
                href={`/profile/${u.username}`}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 transition-all"
              >
                <Avatar src={u.avatarUrl} alt={u.username} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="font-semibold text-sm text-gray-900 truncate">{u.displayName}</p>
                    <TrustBadge status={u.verificationStatus} />
                  </div>
                  <p className="text-xs text-gray-400 truncate">@{u.username}</p>
                </div>
              </Link>
            ))}
            {!searching && results.length === 0 && (
              <p className="text-center text-gray-400 py-10">No people found for &ldquo;{query}&rdquo;</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* Trending topics */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Sparkles size={15} className="text-purple-500" /> Trending topics
              </h2>
              <div className="flex flex-wrap gap-2">
                {TRENDING.map((tag) => (
                  <span
                    key={tag}
                    className="px-3.5 py-1.5 rounded-full bg-white ring-1 ring-purple-100 text-sm font-semibold text-purple-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>

            {/* Suggested creators */}
            <section>
              <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">
                <Users size={15} className="text-purple-500" /> Suggested creators
              </h2>
              {loading ? (
                <CreatorSkeleton />
              ) : creators.length === 0 ? (
                <EmptyHint text="No creators to suggest yet." />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {creators.map((c) => (
                    <div key={c.id} className="rounded-2xl bg-white ring-1 ring-gray-100 p-4 text-center">
                      <Link href={`/profile/${c.username}`} className="flex flex-col items-center">
                        <Avatar src={c.avatarUrl} alt={c.username} size="lg" />
                        <div className="flex items-center gap-1 mt-2">
                          <p className="font-semibold text-sm text-gray-900 truncate max-w-[7rem]">{c.displayName}</p>
                          <TrustBadge status={c.verificationStatus} />
                        </div>
                        <p className="text-xs text-gray-400 truncate max-w-[8rem]">@{c.username}</p>
                      </Link>
                      <button
                        onClick={() => follow(c.username)}
                        disabled={followed[c.username]}
                        className="mt-3 w-full py-1.5 rounded-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-100 disabled:text-gray-400 text-white text-xs font-semibold transition-colors"
                      >
                        {followed[c.username] ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Explore grid */}
            <ExploreGrid title="Discover" icon={<Compass size={15} className="text-purple-500" />} loading={loading} posts={explore} />

            {/* Verified Humans */}
            <ExploreGrid
              title="Verified Humans"
              icon={<ShieldCheck size={15} className="text-purple-500" />}
              loading={loading}
              posts={verified}
              emptyText="No posts from verified humans yet."
            />

            {/* Family Safe */}
            <ExploreGrid
              title="Family Safe picks"
              icon={<ShieldCheck size={15} className="text-emerald-500" />}
              loading={loading}
              posts={familySafe}
              emptyText="No family-safe picks yet."
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function ExploreGrid({
  title, icon, loading, posts, emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  loading: boolean;
  posts: ExplorePost[];
  emptyText?: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-1.5">{icon} {title}</h2>
      {loading ? (
        <GridSkeleton />
      ) : posts.length === 0 ? (
        <EmptyHint text={emptyText ?? 'Nothing here yet.'} />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
          {posts.slice(0, 12).map((post) => {
            const first = post.media[0];
            const src = resolveMediaUrl(first.url);
            const isVideo = first.mimeType?.startsWith('video/');
            return (
              <Link
                key={post.id}
                href={`/profile/${post.author.username}`}
                className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100"
              >
                {isVideo ? (
                  <video src={src} className="w-full h-full object-cover" muted />
                ) : (
                  <Image src={src} alt={post.caption ?? 'post'} fill sizes="33vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                )}
                {isVideo && (
                  <div className="absolute top-1.5 right-1.5"><Film size={14} className="text-white drop-shadow" /></div>
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                  <span className="flex items-center gap-1 text-white text-xs font-bold drop-shadow">
                    <Heart size={14} fill="white" strokeWidth={0} />{formatCount(post._count.likes)}
                  </span>
                  <span className="flex items-center gap-1 text-white text-xs font-bold drop-shadow">
                    <MessageCircle size={14} fill="white" strokeWidth={0} />{formatCount(post._count.comments)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-2xl ring-1 ring-gray-100 bg-gray-50/60 py-8 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}

function CreatorSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white ring-1 ring-gray-100 p-4 flex flex-col items-center gap-2 animate-pulse">
          <div className="w-14 h-14 rounded-full bg-gray-100" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
          <div className="h-3 w-14 bg-gray-100 rounded" />
          <div className="h-7 w-full bg-gray-100 rounded-full mt-1" />
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
      ))}
    </div>
  );
}
