'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Video, Phone, Check, Search as SearchIcon, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useCallStore } from '@/store/call';
import { startCall } from '@/lib/calls';

interface UserLite {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export default function NewCallPage() {
  const router = useRouter();
  const { user: me } = useAuthStore();
  const beginCall = useCallStore((s) => s.start);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserLite[]>([]);
  const [selected, setSelected] = useState<UserLite[]>([]);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get(`/users/search?q=${encodeURIComponent(query)}`)
      .then(({ data }) => {
        if (!active) return;
        const list: UserLite[] = (Array.isArray(data) ? data : data?.data ?? []).filter(
          (u: UserLite) => u.username !== me?.username,
        );
        setResults(list.slice(0, 30));
      })
      .catch(() => setResults([]));
    return () => {
      active = false;
    };
  }, [query, me?.username]);

  const toggle = (u: UserLite) => {
    setSelected((prev) =>
      prev.find((s) => s.id === u.id) ? prev.filter((s) => s.id !== u.id) : [...prev, u],
    );
  };

  const start = async (video: boolean) => {
    if (selected.length === 0 || starting) return;
    setStarting(true);
    const group = selected.length > 1;
    const room = await startCall({
      targets: selected.map((s) => s.username),
      video,
      group,
    });
    beginCall(room, video);
    router.push('/feed');
  };

  return (
    <AppShell>
      <div className="px-4 py-6">
        <h1 className="text-2xl font-black text-gray-900 mb-1">Start a call</h1>
        <p className="text-sm text-gray-500 mb-5">
          Pick one person for a 1:1 call, or several for a group call.
        </p>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selected.map((s) => (
              <button
                key={s.id}
                onClick={() => toggle(s)}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-purple-100 text-purple-700 text-sm font-medium"
              >
                <Avatar src={s.avatarUrl} alt={s.displayName} size="xs" />
                {s.displayName}
                <X size={14} />
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-4">
          <SearchIcon size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-sm"
          />
        </div>

        {/* Results */}
        <div className="flex flex-col divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden mb-24">
          {results.length === 0 && (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">No people found.</p>
          )}
          {results.map((u) => {
            const isSel = !!selected.find((s) => s.id === u.id);
            return (
              <button
                key={u.id}
                onClick={() => toggle(u)}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
              >
                <Avatar src={u.avatarUrl} alt={u.displayName} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{u.displayName}</p>
                  <p className="text-xs text-gray-500 truncate">@{u.username}</p>
                </div>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center border-2 ${
                    isSel ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300'
                  }`}
                >
                  {isSel && <Check size={14} />}
                </span>
              </button>
            );
          })}
        </div>

        {/* Action bar */}
        {selected.length > 0 && (
          <div className="fixed bottom-20 md:bottom-6 left-0 md:left-64 right-0 px-4 z-30">
            <div className="mx-auto max-w-xl flex gap-3">
              <button
                onClick={() => start(false)}
                disabled={starting}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-green-500 hover:bg-green-600 text-white font-semibold shadow-lg disabled:opacity-60"
              >
                <Phone size={18} /> Voice call
              </button>
              <button
                onClick={() => start(true)}
                disabled={starting}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-semibold shadow-lg disabled:opacity-60"
              >
                <Video size={18} /> Video call
                {selected.length > 1 ? ` (${selected.length})` : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
