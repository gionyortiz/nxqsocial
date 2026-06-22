'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronDown, ChevronUp } from 'lucide-react';
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
  const [activeIndex, setActiveIndex] = useState(0);

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

  const boundedActiveIndex = Math.min(activeIndex, Math.max(0, items.length - 1));

  const move = (dir: 1 | -1) => {
    setActiveIndex((prev) => {
      const clamped = Math.min(prev, Math.max(0, items.length - 1));
      const next = clamped + dir;
      if (next < 0) return 0;
      if (next > items.length - 1) return items.length - 1;
      return next;
    });
  };

  const desktopVisible = [boundedActiveIndex - 1, boundedActiveIndex, boundedActiveIndex + 1]
    .filter((idx) => idx >= 0 && idx < items.length)
    .map((idx) => ({ idx, item: items[idx], pos: idx - boundedActiveIndex }));

  const renderBubble = (p: StoryUser, labelOverride?: string) => {
    const isYou = p.id.startsWith('you:');
    return (
      <>
        <div className="relative">
          {isYou ? (
            <Avatar src={p.avatarUrl} alt={p.username} size="lg" />
          ) : (
            <div className={`p-[2px] rounded-full ${p.isLive ? 'bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-amber-400' : 'bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-amber-400'}`}>
              <div className="p-[2px] bg-white rounded-full">
                <Avatar src={p.avatarUrl} alt={p.username} size="lg" />
              </div>
            </div>
          )}
          {isYou && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-purple-600 border-2 border-white flex items-center justify-center">
              <Plus size={12} className="text-white" />
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-600 truncate w-full text-center">{labelOverride ?? p.username}</span>
        {!isYou && (
          <span className={`-mt-1 text-[10px] font-semibold ${p.isLive ? 'text-rose-500' : 'text-purple-600'}`}>
            {p.isLive ? 'LIVE' : 'NEW'}
          </span>
        )}
      </>
    );
  };

  return (
    <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth sm:hidden">
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
          <div className="flex min-h-[78px] items-center px-2 text-sm text-gray-500">
            Follow more people to see live sessions and new posts here.
          </div>
        )}
      </div>

      {/* Desktop: vertical stack with center-focused story */}
      <div className="hidden sm:flex flex-col items-center gap-3 py-1">
        <button
          type="button"
          onClick={() => move(-1)}
          disabled={boundedActiveIndex <= 0}
          aria-label="Previous story"
          className="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronUp size={16} />
        </button>

        <div className="w-full max-w-[220px] mx-auto min-h-[220px] flex flex-col items-center justify-center gap-2">
          {desktopVisible.map(({ idx, item, pos }) => {
            const isCenter = pos === 0;
            const href = idx === 0 ? '/upload' : `/profile/${item.username}`;
            return (
              <Link
                key={item.id}
                href={href}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`flex flex-col items-center gap-1.5 transition-all duration-200 ${
                  isCenter ? 'scale-100 opacity-100' : 'scale-90 opacity-60'
                }`}
              >
                {renderBubble(item, idx === 0 ? 'Your story' : undefined)}
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => move(1)}
          disabled={boundedActiveIndex >= items.length - 1}
          aria-label="Next story"
          className="w-8 h-8 rounded-full bg-white shadow-sm border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronDown size={16} />
        </button>
      </div>

      {people.length === 0 && suggested.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Suggested creators</p>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">
            {suggested.map((p) => (
              <Link key={p.id} href={`/profile/${p.username}`} className="flex min-w-[150px] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 hover:bg-gray-100">
                <Avatar src={p.avatarUrl} alt={p.username} size="sm" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-800">{p.displayName}</p>
                  <p className="truncate text-xs text-gray-500">@{p.username}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
