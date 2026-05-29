'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  formatChatMessageLinks,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { PhoneOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function CallRoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useAuthStore();

  const room = decodeURIComponent(String(params.room ?? ''));
  const video = search.get('video') !== '0';

  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    api
      .post('/calls/token', { room, video })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data.url) {
          setError('Calling is not configured yet. Add your LiveKit keys on the server.');
          return;
        }
        setToken(data.token);
        setServerUrl(data.url);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e?.response?.data?.message ??
            'Could not start the call. Please make sure you are signed in.',
        );
      });
    // Clear any pending incoming-invite for me once I join
    api.post('/calls/decline').catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [room, video]);

  const leave = () => router.push('/feed');

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <PhoneOff size={40} className="text-red-500 mb-4" />
        <h1 className="text-xl font-bold mb-2">Call unavailable</h1>
        <p className="text-gray-400 max-w-md text-sm">{error}</p>
        <button
          onClick={leave}
          className="mt-6 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium"
        >
          Back to feed
        </button>
      </div>
    );
  }

  if (!token || !serverUrl) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
        <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-sm">Connecting{user ? `, ${user.displayName}` : ''}…</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black" data-lk-theme="default">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        video={video}
        audio
        onDisconnected={leave}
        style={{ height: '100%' }}
      >
        <VideoConference chatMessageFormatter={formatChatMessageLinks} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
