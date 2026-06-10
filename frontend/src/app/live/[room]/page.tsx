'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { LiveKitRoom } from '@livekit/components-react';
import '@livekit/components-styles';
import { Radio } from 'lucide-react';
import { api } from '@/lib/api';
import { LiveExperience } from '@/components/live/LiveExperience';
import { trackEvent, trackFirstEvent } from '@/lib/analytics';

export default function LiveRoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();

  const room = decodeURIComponent(String(params.room ?? ''));
  const host = search.get('host') === '1';
  const guest = search.get('guest') === '1';
  const isOwner = host && !guest;

  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guest pre-join: ask for camera/mic permissions before connecting
  const [guestReady, setGuestReady] = useState(!guest);

  useEffect(() => {
    if (!room) return;
    let cancelled = false;
    api
      .post('/calls/token', { room, video: host, host })
      .then(({ data }) => {
        if (cancelled) return;
        if (!data.url) {
          setError('Live streaming is not configured yet. Add your LiveKit keys on the server.');
          return;
        }
        if (host) {
          void trackEvent('live_started', { room, source: 'live_room_page' });
        } else {
          void trackEvent('live_joined', { room });
          void trackFirstEvent('first_live_joined', 'first_live_joined', { room });
        }
        setToken(data.token);
        setServerUrl(data.url);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e?.response?.data?.message ??
            'Could not start the broadcast. Please make sure you are signed in.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [room, host]);

  const leave = () => router.push('/feed');

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <Radio size={40} className="text-rose-500 mb-4" />
        <h1 className="text-xl font-bold mb-2">Live unavailable</h1>
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
        <div className="w-8 h-8 border-2 border-rose-400 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-400 text-sm">{host ? 'Starting your broadcast…' : 'Joining live stream…'}</p>
      </div>
    );
  }

  // Guest pre-join screen: request permissions before entering
  if (guest && !guestReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 text-center">
        <Radio size={40} className="text-green-400 mb-4" />
        <h1 className="text-xl font-bold mb-2">You&apos;re invited to go live!</h1>
        <p className="text-gray-400 text-sm mb-8 max-w-sm">
          You&apos;ll be joining the live stream with your camera and microphone. Make sure you&apos;re ready before joining.
        </p>
        <button
          onClick={async () => {
            try {
              // Request permissions proactively so the browser doesn't block them
              await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            } catch {
              // User may deny — they can still join with just mic
            }
            setGuestReady(true);
          }}
          className="px-8 py-3 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold text-lg shadow-lg hover:opacity-90 transition mb-3"
        >
          🎥 Join Live Now
        </button>
        <button onClick={leave} className="text-sm text-gray-500 hover:text-gray-300 transition">
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-black" data-lk-theme="default">
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        video={host}
        audio={host}
        onDisconnected={leave}
        style={{ height: '100%' }}
      >
        <LiveExperience host={host} isOwner={isOwner} room={room} onLeave={leave} />
      </LiveKitRoom>
    </div>
  );
}
