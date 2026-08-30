'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

interface StoryUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isLive?: boolean;
  hasRecentPost?: boolean;
}

interface StoriesResponse {
  storyCandidates: StoryUser[];
  suggestedCreators: Array<Pick<StoryUser, 'id' | 'username' | 'displayName' | 'avatarUrl'>>;
}

/**
 * Instagram-style stories row shown at the top of the feed.
 * Shows the current user's "add story" bubble followed by other users
 * wrapped in the signature gradient ring.
 */
export function StoriesBar() {
  const { user } = useAuthStore();
  const [people, setPeople] = useState<StoryUser[]>([]);
  const [suggested, setSuggested] = useState<Array<Pick<StoryUser, 'id' | 'username' | 'displayName' | 'avatarUrl'>>>([]);

  useEffect(() => {
    if (!user?.username) {
      return;
    }

    api
      .get('/feed/stories', { params: { take: 15 } })
      .then(({ data }) => {
        const payload = (data ?? {}) as StoriesResponse;
        setPeople(Array.isArray(payload.storyCandidates) ? payload.storyCandidates : []);
        setSuggested(Array.isArray(payload.suggestedCreators) ? payload.suggestedCreators : []);
      })
      .catch(() => {
        setPeople([]);
        setSuggested([]);
      });
  }, [user?.username]);

  const items = useMemo(() => {
    const yourItem: StoryUser = {
      id: `you:${user?.id ?? 'me'}`,
      username: user?.username ?? 'you',
      displayName: 'Your story',
      avatarUrl: user?.avatarUrl,
    };
    return [yourItem, ...people];
  }, [people, user?.avatarUrl, user?.id, user?.username]);

  const renderBubble = (p: StoryUser, labelOverride?: string) => {
    const isYou = p.id.startsWith('you:');
    return (
      <>
        <div className="relative">
          {isYou ? (
            <Avatar src={p.avatarUrl} alt={p.username} size="lg" />
          ) : (
            <div className={`p-[2px] rounded-full ${p.isLive ? 'bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-amber-400' : 'bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-amber-400'}`}>
              <div className="p-[2px] bg-[#0d1420] rounded-full">
                <Avatar src={p.avatarUrl} alt={p.username} size="lg" />
              </div>
            </div>
          )}
          {isYou && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-fuchsia-600 border-2 border-[#0d1420] flex items-center justify-center">
              <Plus size={12} className="text-white" />
            </span>
          )}
        </div>
        <span className="text-[11px] text-slate-400 truncate w-full text-center">{labelOverride ?? p.username}</span>
        {!isYou && (
          <span className={`-mt-1 text-[10px] font-semibold ${p.isLive ? 'text-rose-500' : 'text-purple-600'}`}>
            {p.isLive ? 'LIVE' : 'NEW'}
          </span>
        )}
      </>
    );
  };

  return (
    <div className="nxq-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div><p className="nxq-kicker">Stories</p><h2 className="mt-1 text-sm font-semibold text-slate-100">From your circle</h2></div>
        <Link href="/search" className="text-xs font-semibold text-fuchsia-400 hover:text-fuchsia-300">Discover people</Link>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-1">
        {/* Your story */}
        <Link href="/upload" className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16">
          {renderBubble(items[0], 'Your story')}
        </Link>

        {/* Following activity */}
        {people.map((p) => (
          <Link
            key={p.id}
            href={`/profile/${p.username}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16"
          >
            {renderBubble(p)}
          </Link>
        ))}

        {people.length === 0 && (
          <div className="flex min-h-[78px] items-center px-2 text-sm text-gray-500 dark:text-gray-400">
            Follow more people to see live sessions and new posts here.
          </div>
        )}
      </div>

      {people.length === 0 && suggested.length > 0 && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Suggested creators</p>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {suggested.map((p) => (
              <Link key={p.id} href={`/profile/${p.username}`} className="flex min-w-[150px] items-center gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-2 hover:bg-gray-100 dark:hover:bg-white/10">
                <Avatar src={p.avatarUrl} alt={p.username} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{p.displayName}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">@{p.username}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
