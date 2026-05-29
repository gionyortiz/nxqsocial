'use client';

import { useEffect, useState } from 'react';
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
}

/**
 * Instagram-style stories row shown at the top of the feed.
 * Shows the current user's "add story" bubble followed by other users
 * wrapped in the signature gradient ring.
 */
export function StoriesBar() {
  const { user } = useAuthStore();
  const [people, setPeople] = useState<StoryUser[]>([]);

  useEffect(() => {
    api
      .get('/users/search', { params: { q: '' } })
      .then(({ data }) => {
        const list: StoryUser[] = Array.isArray(data) ? data : [];
        setPeople(list.filter((u) => u.username !== user?.username).slice(0, 15));
      })
      .catch(() => {});
  }, [user?.username]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex gap-4 overflow-x-auto scrollbar-hide">
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
