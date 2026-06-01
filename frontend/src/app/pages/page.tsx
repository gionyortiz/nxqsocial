'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';

const PAGES = [
  { name: 'NXQ Social Admin', handle: '@nxqadmin', role: 'Brand page', posts: 18 },
  { name: 'NXQ Creative Studio', handle: '@nxqstudio', role: 'Media page', posts: 7 },
  { name: 'Family Safe Hub', handle: '@familysafe', role: 'Community page', posts: 12 },
];

export default function PagesPage() {
  return (
    <AppShell>
      <div className="px-3 sm:px-4 py-4 space-y-4">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-600">My Pages</p>
          <h1 className="mt-1 text-2xl font-black text-gray-900">Your brands and public pages</h1>
          <p className="mt-2 text-sm text-gray-500 max-w-2xl">
            This is the UI shell for user-owned pages, brand hubs, and community pages. It can be connected to a real backend later.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {PAGES.map((page) => (
            <Link key={page.handle} href="/settings" className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm hover:shadow-md hover:border-purple-200 transition-all">
              <div className="flex items-center gap-3">
                <Avatar src={null} alt={page.handle} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900 truncate">{page.name}</p>
                  <p className="text-sm text-gray-500">{page.handle}</p>
                  <p className="text-xs text-purple-600 mt-1">{page.role}</p>
                </div>
                <span className="text-xs font-bold rounded-full bg-purple-50 text-purple-700 px-2 py-1">{page.posts} posts</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
