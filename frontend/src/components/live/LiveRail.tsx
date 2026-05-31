'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio } from 'lucide-react';
import { fetchActiveLives, liveHref, type ActiveLive } from '@/lib/live';
import { Avatar } from '@/components/ui/Avatar';

const POLL_MS = 20_000;

/**
 * Horizontal rail of broadcasters who are live right now. Hidden entirely when
 * nobody is live, so it never adds clutter.
 */
export function LiveRail() {
  const router = useRouter();
  const [lives, setLives] = useState<ActiveLive[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const data = await fetchActiveLives();
      if (active) setLives(data);
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  if (lives.length === 0) return null;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-white ring-1 ring-rose-100 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
        </span>
        <span className="text-xs font-semibold text-gray-700">Live now</span>
      </div>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide">
        {lives.map((l) => (
          <button
            key={l.room}
            onClick={() => router.push(liveHref(l.room))}
            className="flex flex-col items-center gap-1 shrink-0 w-16"
          >
            <span className="relative">
              <span className="block rounded-full p-[2px] bg-gradient-to-tr from-rose-500 to-red-600">
                <span className="block rounded-full p-[2px] bg-white">
                  <Avatar src={l.host.avatarUrl ?? undefined} alt={l.host.displayName} size="lg" />
                </span>
              </span>
              <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1.5 py-[1px] rounded-full bg-rose-600 text-white text-[8px] font-bold uppercase">
                Live
              </span>
            </span>
            <span className="text-[11px] text-gray-700 font-medium truncate max-w-[64px]">
              {l.host.displayName}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
