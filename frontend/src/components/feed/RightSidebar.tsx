'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

interface SuggestedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  verificationStatus: string;
  trustScore: number;
}

const TRENDING = [
  { tag: '#NexaQuantum', posts: '12.4K' },
  { tag: '#VerifiedHuman', posts: '8.1K' },
  { tag: '#TrustFirst', posts: '5.7K' },
  { tag: '#NoBots', posts: '3.2K' },
  { tag: '#FamilySafe', posts: '2.9K' },
];

/**
 * Twitter/Instagram-web style right rail: profile mini-card,
 * "Suggested for you" people, trending topics, and footer links.
 */
export function RightSidebar() {
  const { user } = useAuthStore();
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api
      .get('/users/search', { params: { q: '' } })
      .then(({ data }) => {
        const list: SuggestedUser[] = Array.isArray(data) ? data : [];
        setSuggested(list.filter((u) => u.username !== user?.username).slice(0, 5));
      })
      .catch(() => {});
  }, [user?.username]);

  const follow = async (username: string) => {
    setFollowed((f) => ({ ...f, [username]: true }));
    try {
      await api.post(`/users/${username}/follow`);
    } catch {
      setFollowed((f) => ({ ...f, [username]: false }));
    }
  };

  return (
    <div className="flex flex-col gap-5 sticky top-6">
      {/* Profile mini-card */}
      {user && (
        <Link
          href={`/profile/${user.username}`}
          className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:bg-gray-50 transition-colors"
        >
          <Avatar src={user.avatarUrl} alt={user.username} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-sm text-gray-900 truncate">{user.displayName}</span>
              <TrustBadge status={user.verificationStatus} />
            </div>
            <p className="text-xs text-gray-400 truncate">@{user.username}</p>
          </div>
        </Link>
      )}

      {/* Suggested for you */}
      {suggested.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Suggested for you</h3>
            <Link href="/search" className="text-xs text-purple-600 font-medium hover:underline">
              See all
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {suggested.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <Link href={`/profile/${s.username}`}>
                  <Avatar src={s.avatarUrl} alt={s.username} size="md" />
                </Link>
                <Link href={`/profile/${s.username}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-sm text-gray-900 truncate">{s.username}</span>
                    <TrustBadge status={s.verificationStatus} />
                  </div>
                  <p className="text-xs text-gray-400 truncate">{s.displayName}</p>
                </Link>
                <button
                  onClick={() => follow(s.username)}
                  disabled={followed[s.username]}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 disabled:text-gray-400 flex-shrink-0"
                >
                  {followed[s.username] ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trending */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Trending on NXQ</h3>
        <div className="flex flex-col gap-2.5">
          {TRENDING.map((t) => (
            <Link
              key={t.tag}
              href="/search"
              className="flex items-center justify-between group"
            >
              <span className="text-sm font-medium text-purple-600 group-hover:underline">{t.tag}</span>
              <span className="text-xs text-gray-400">{t.posts} posts</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/privacy" className="hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:underline">Terms</Link>
        <Link href="/community-guidelines" className="hover:underline">Guidelines</Link>
        <span className="w-full mt-1">© {new Date().getFullYear()} NXQ Social</span>
      </div>
    </div>
  );
}
