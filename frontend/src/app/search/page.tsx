'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { api } from '@/lib/api';

interface UserResult {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isVerified: boolean;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);

  const onSearch = async (q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/users/search', { params: { q } });
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-xl mx-auto px-4 py-6">
        <h2 className="text-lg font-bold mb-4">Search</h2>

        <div className="relative mb-6">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search people…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <div className="flex flex-col gap-3">
          {results.map((user) => (
            <Link
              key={user.id}
              href={`/profile/${user.username}`}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-gray-100 hover:border-purple-200 transition-all"
            >
              <Avatar src={user.avatarUrl} alt={user.username} size="md" />
              <div>
                <p className="font-semibold text-sm">{user.displayName}</p>
                <p className="text-xs text-gray-400">@{user.username}</p>
              </div>
            </Link>
          ))}

          {!loading && query && results.length === 0 && (
            <p className="text-center text-gray-400 py-8">No users found for &ldquo;{query}&rdquo;</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
