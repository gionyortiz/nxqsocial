'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    if (!user?.username) {
      setPeople([]);
      setSuggested([]);
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

  // Track whether the row can scroll further in each direction.
  const updateArrows = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [people]);

  const slide = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  // Let a vertical mouse wheel scroll the row horizontally.
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      {/* Left arrow */}
      {canLeft && (
        <button
          type="button"
          onClick={() => slide(-1)}
          aria-label="Scroll left"
          className="hidden sm:flex absolute left-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center text-gray-600 hover:bg-gray-50"
        >
          <ChevronLeft size={18} />
        </button>
      )}
      {/* Right arrow */}
      {canRight && (
        <button
          type="button"
          onClick={() => slide(1)}
          aria-label="Scroll right"
          className="hidden sm:flex absolute right-1 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center text-gray-600 hover:bg-gray-50"
        >
          <ChevronRight size={18} />
        </button>
      )}

      <div ref={scrollRef} onWheel={onWheel} className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth">
        {/* Your story */}
        <Link href="/upload" className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16">
          <div className="relative">
            <Avatar src={user?.avatarUrl} alt={user?.username ?? 'You'} size="lg" />
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-purple-600 border-2 border-white flex items-center justify-center">
              <Plus size={12} className="text-white" />
            </span>
          </div>
          <span className="text-[11px] text-gray-600 truncate w-full text-center">Your story</span>
        </Link>

        {/* Following activity */}
        {people.map((p) => (
          <Link
            key={p.id}
            href={`/profile/${p.username}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16"
          >
            <div className={`p-[2px] rounded-full ${p.isLive ? 'bg-gradient-to-tr from-rose-500 via-fuchsia-500 to-amber-400' : 'bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-amber-400'}`}>
              <div className="p-[2px] bg-white rounded-full">
                <Avatar src={p.avatarUrl} alt={p.username} size="lg" />
              </div>
            </div>
            <span className="text-[11px] text-gray-600 truncate w-full text-center">{p.username}</span>
            <span className={`-mt-1 text-[10px] font-semibold ${p.isLive ? 'text-rose-500' : 'text-purple-600'}`}>
              {p.isLive ? 'LIVE' : 'NEW'}
            </span>
          </Link>
        ))}

        {people.length === 0 && (
          <div className="flex min-h-[78px] items-center px-2 text-sm text-gray-500">
            Follow more people to see live sessions and new posts here.
          </div>
        )}
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
