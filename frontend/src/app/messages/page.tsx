'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';

const CONVERSATIONS = [
  { name: 'Ortiz Giony', username: 'gionyortiz', last: 'Sent a reel to you', time: '2m', unread: 2 },
  { name: 'Maya Rivera', username: 'maya_rivera', last: 'Liked your photo', time: '18m', unread: 1 },
  { name: 'NXQ Admin', username: 'nxqadmin', last: 'Your verification is under review', time: '1h', unread: 0 },
];

export default function MessagesPage() {
  return (
    <AppShell>
      <div className="px-3 sm:px-4 py-4 space-y-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">Messages</p>
          <h1 className="mt-1 text-2xl font-black text-gray-900">Inbox coming soon</h1>
          <p className="mt-2 text-sm text-gray-500 max-w-2xl">
            This is the desktop shell for NXQ chat. The real messaging backend can be added next without changing the navigation or layout.
          </p>
        </div>

        <div className="grid gap-3">
          {CONVERSATIONS.map((thread) => (
            <Link
              key={thread.username}
              href={`/profile/${thread.username}`}
              className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:border-purple-200 hover:shadow-md transition-all"
            >
              <Avatar src={null} alt={thread.username} size="md" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-gray-900 truncate">{thread.name}</p>
                  {thread.unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">{thread.unread}</span>}
                </div>
                <p className="text-sm text-gray-500 truncate">@{thread.username}</p>
                <p className="text-sm text-gray-700 mt-1">{thread.last}</p>
              </div>
              <span className="text-xs text-gray-400">{thread.time}</span>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
