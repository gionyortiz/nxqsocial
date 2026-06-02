'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Navbar } from './Navbar';

export function AppShell({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  // Hide the demo "3" badge once the user has opened /messages at least once.
  const [seenMessages, setSeenMessages] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('nxq_nav_seen');
      if (raw && JSON.parse(raw)?.['/messages']) setSeenMessages(true);
    } catch {}
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="pb-20 md:pb-0 min-h-screen md:pl-64 overflow-x-hidden">
        <div className="mx-auto max-w-[1540px] w-full min-w-0 flex justify-center gap-5 lg:gap-6 xl:gap-8 px-2 sm:px-4 xl:px-6">
          <div className="w-full min-w-0 max-w-[860px]">{children}</div>
          {aside && (
            <aside className="hidden lg:block w-[360px] flex-shrink-0 py-4">{aside}</aside>
          )}
        </div>
      </main>

      <Link
        href="/messages"
        className="hidden md:flex fixed bottom-5 right-5 z-50 items-center gap-2 rounded-full bg-gray-900/90 px-4 py-3 text-white shadow-2xl shadow-purple-900/20 ring-1 ring-white/10 backdrop-blur-md hover:bg-gray-800 transition-colors"
      >
        <MessageSquare size={18} />
        <span className="text-sm font-semibold">Messages</span>
        {!seenMessages && (
          <span className="ml-1 min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            3
          </span>
        )}
      </Link>
    </div>
  );
}
