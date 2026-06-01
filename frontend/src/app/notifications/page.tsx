'use client';

import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';

const ITEMS = [
  { title: 'Maya Rivera liked your post', body: '1m ago', type: 'like' },
  { title: '2 people commented on your reel', body: '12m ago', type: 'comment' },
  { title: 'NXQ Admin started following you', body: '1h ago', type: 'follow' },
  { title: 'A live broadcast is happening now', body: '5m ago', type: 'live' },
];

export default function NotificationsPage() {
  return (
    <AppShell>
      <div className="px-3 sm:px-4 py-4 space-y-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">Notifications</p>
          <h1 className="mt-1 text-2xl font-black text-gray-900">Updates and activity</h1>
          <p className="mt-2 text-sm text-gray-500 max-w-2xl">
            This page is ready for likes, comments, follows, mentions, live alerts, and call updates.
          </p>
        </div>

        <div className="grid gap-3">
          {ITEMS.map((item) => (
            <div key={item.title} className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <Avatar src={null} alt={item.title} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 truncate">{item.title}</p>
                <p className="text-sm text-gray-500">{item.body}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-1 bg-purple-50 text-purple-700">{item.type}</span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
