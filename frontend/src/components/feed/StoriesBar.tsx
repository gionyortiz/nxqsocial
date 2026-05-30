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
}

/**
 * Instagram-style stories row shown at the top of the feed.
 * Shows the current user's "add story" bubble followed by other users
 * wrapped in the signature gradient ring.
 */
export function StoriesBar() {
  const { user } = useAuthStore();
  const [people, setPeople] = useState<StoryUser[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    api
      .get('/users/search', { params: { q: '' } })
      .then(({ data }) => {
        const list: StoryUser[] = Array.isArray(data) ? data : [];
        setPeople(list.filter((u) => u.username !== user?.username).slice(0, 15));
      })
      .catch(() => {});
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

        {/* Other people */}
        {people.map((p) => (
          <Link
            key={p.id}
            href={`/profile/${p.username}`}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 w-16"
          >
            <div className="p-[2px] rounded-full bg-gradient-to-tr from-purple-500 via-fuchsia-500 to-amber-400">
              <div className="p-[2px] bg-white rounded-full">
                <Avatar src={p.avatarUrl} alt={p.username} size="lg" />
              </div>
            </div>
            <span className="text-[11px] text-gray-600 truncate w-full text-center">{p.username}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
