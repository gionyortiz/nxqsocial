'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { formatCount, cn } from '@/lib/utils';
import { Camera, Clapperboard, PenSquare, ShieldCheck, TrendingUp, Zap, Users } from 'lucide-react';

interface SuggestedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  verificationStatus: string;
  trustScore: number;
}

const TRENDING = [
  { tag: '#NexaQuantum',   posts: '12.4K', hot: true },
  { tag: '#VerifiedHuman', posts: '8.1K',  hot: true },
  { tag: '#TrustFirst',    posts: '5.7K',  hot: false },
  { tag: '#NoBots',        posts: '3.2K',  hot: false },
  { tag: '#FamilySafe',    posts: '2.9K',  hot: false },
];

/**
 * Twitter/Instagram-web style right rail: profile mini-card,
 * "Suggested for you" people, trending topics, and footer links.
 */
export function RightSidebar() {
  const { user } = useAuthStore();
  const [suggested, setSuggested] = useState<SuggestedUser[]>([]);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [profileStats, setProfileStats] = useState<{ followers: number; posts: number } | null>(null);

  useEffect(() => {
    if (!user?.username) {
      setProfileStats(null);
      return;
    }
    api
      .get(`/users/${user.username}`)
      .then(({ data }) => {
        setProfileStats({
          followers: data?._count?.followers ?? 0,
          posts: data?._count?.posts ?? 0,
        });
      })
      .catch(() => {
        setProfileStats(null);
      });
  }, [user?.username]);

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
    <div className="flex flex-col gap-4 sticky top-4">
      {/* Profile mini-card */}
      {user && (
        <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-[var(--shadow-card)] border border-[var(--border)] p-4">
          <Link
            href={`/profile/${user.username}`}
            className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors rounded-2xl p-1.5"
          >
            <span className="ring-verified flex-shrink-0">
              <span className="block rounded-full overflow-hidden bg-white dark:bg-[#111827] p-[2px]">
                <Avatar src={user.avatarUrl} alt={user.username} size="lg" />
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate">{user.displayName}</span>
                <TrustBadge status={user.verificationStatus} />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate">@{user.username}</p>
            </div>
          </Link>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-fuchsia-50 dark:from-purple-900/20 dark:to-fuchsia-900/20 px-2 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Trust</p>
              <p className="text-sm font-black gradient-text">{Math.round(user.trustScore ?? 0)}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 dark:bg-white/[0.04] px-2 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Followers</p>
              <p className="text-sm font-black text-gray-900 dark:text-gray-100">{formatCount(profileStats?.followers ?? 0)}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 dark:bg-white/[0.04] px-2 py-2.5 text-center">
              <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Posts</p>
              <p className="text-sm font-black text-gray-900 dark:text-gray-100">{formatCount(profileStats?.posts ?? 0)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {[{href:'/upload', icon:PenSquare, label:'Post'},{href:'/upload', icon:Camera, label:'Photo'},{href:'/upload', icon:Clapperboard, label:'Reel'}].map(({href,icon:Icon,label}) => (
              <Link key={label} href={href} className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] py-2.5 text-[11px] font-bold text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 hover:text-purple-700 dark:hover:text-purple-300 hover:border-purple-200 transition-all">
                <Icon size={15} className="mb-1" />{label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Suggested for you */}
      {suggested.length > 0 && (
        <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-[var(--shadow-card)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-purple-500" />
              <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Suggested for you</h3>
            </div>
            <Link href="/search" className="text-xs font-bold text-purple-600 hover:text-purple-700 transition-colors">
              See all
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {suggested.map((s) => (
              <div key={s.id} className="flex items-center gap-3 group/sug">
                <Link href={`/profile/${s.username}`}>
                  <Avatar src={s.avatarUrl} alt={s.username} size="md" />
                </Link>
                <Link href={`/profile/${s.username}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate group-hover/sug:text-purple-700 dark:group-hover/sug:text-purple-400 transition-colors">{s.username}</span>
                    <TrustBadge status={s.verificationStatus} />
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{s.displayName}</p>
                </Link>
                <button
                  onClick={() => follow(s.username)}
                  disabled={followed[s.username]}
                  className={cn('text-xs font-bold flex-shrink-0 px-3 py-1.5 rounded-full transition-all', followed[s.username] ? 'bg-gray-100 dark:bg-white/10 text-gray-500' : 'btn-gradient')}
                >
                  {followed[s.username] ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trending */}
      <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-[var(--shadow-card)] border border-[var(--border)] p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={15} className="text-fuchsia-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Trending on NXQ</h3>
        </div>
        <div className="flex flex-col gap-1">
          {TRENDING.map((item, i) => (
            <Link
              key={item.tag}
              href="/search"
              className="flex items-center gap-3 group px-2 py-2 rounded-2xl hover:bg-purple-50 dark:hover:bg-white/[0.04] transition-colors"
            >
              <span className="text-[11px] font-black text-gray-300 dark:text-gray-600 w-4 flex-shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-purple-600 dark:text-purple-400 group-hover:text-purple-700 transition-colors truncate block">{item.tag}</span>
                <span className="text-[11px] text-gray-400 dark:text-gray-500">{item.posts} posts</span>
              </div>
              {item.hot && (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-500 bg-orange-50 dark:bg-orange-900/30 px-2 py-0.5 rounded-full flex-shrink-0">
                  <Zap size={9} fill="currentColor" />Hot
                </span>
              )}
            </Link>
          ))}
        </div>
        <div className="mt-3 rounded-2xl bg-gradient-to-r from-purple-50 to-fuchsia-50 dark:from-purple-900/20 dark:to-fuchsia-900/20 border border-purple-100 dark:border-purple-800/30 px-3 py-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={14} className="text-purple-600 dark:text-purple-400" />
            <p className="text-xs font-bold text-purple-800 dark:text-purple-300">Trust-first ranking active</p>
          </div>
          <p className="text-[11px] text-purple-600 dark:text-purple-400 leading-relaxed">Verified humans and safe content are boosted in your feed.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-2 text-[11px] text-gray-400 dark:text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/privacy" className="hover:text-purple-600 hover:underline transition-colors">Privacy</Link>
        <Link href="/terms" className="hover:text-purple-600 hover:underline transition-colors">Terms</Link>
        <Link href="/community-guidelines" className="hover:text-purple-600 hover:underline transition-colors">Guidelines</Link>
        <span className="w-full mt-1 font-medium">© {new Date().getFullYear()} NXQ Social</span>
      </div>
    </div>
  );
}
