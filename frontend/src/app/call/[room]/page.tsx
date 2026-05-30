'use client';

import { useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useCallStore } from '@/store/call';

/**
 * Deep-link route for a call. Calls now run in a global floating window, so this
 * page just hands the room off to the call store and returns to the feed.
 */
export default function CallRoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const beginCall = useCallStore((s) => s.start);

  const room = decodeURIComponent(String(params.room ?? ''));
  const video = search.get('video') !== '0';

  useEffect(() => {
    if (room) beginCall(room, video);
    router.replace('/feed');
  }, [room, video, beginCall, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
      <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-gray-400 text-sm">Opening call…</p>
    </div>
  );
}
