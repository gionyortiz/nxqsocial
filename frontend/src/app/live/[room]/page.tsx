'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  ControlBar,
  useTracks,
  useParticipants,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { Radio, Users, Link2, Check, MessageSquare, X } from 'lucide-react';
import { api } from '@/lib/api';

export default function LiveRoomPage() {
  const params = useParams();
  const search = useSearchParams();
  const router = useRouter();

  const room = decodeURIComponent(String(params.room ?? ''));
  const host = search.get('host') === '1';

  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        <LiveStage host={host} room={room} onLeave={leave} />
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

function LiveStage({ host, room, onLeave }: { host: boolean; room: string; onLeave: () => void }) {
  const participants = useParticipants();
  const cameraTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );
  const [copied, setCopied] = useState(false);

  // Viewers = everyone except the broadcaster.
  const viewers = Math.max(0, participants.length - 1);

  const copyLink = async () => {
    try {
      const url = `${window.location.origin}/live/${encodeURIComponent(room)}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-900/95 text-white">
        <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-600 text-white text-xs font-bold">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
        </span>
        <span className="flex items-center gap-1 text-sm text-gray-200">
          <Users size={15} /> {viewers} watching
        </span>
        <div className="flex-1" />
        {host && (
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium"
          >
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            {copied ? 'Copied' : 'Share link'}
          </button>
        )}
        <button
          onClick={onLeave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-xs font-semibold"
        >
          <X size={14} /> {host ? 'End' : 'Leave'}
        </button>
      </div>

      {/* Stage */}
      <div className="flex-1 min-h-0 relative">
        {cameraTracks.length > 0 ? (
          <GridLayout tracks={cameraTracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
            <Radio size={36} className="text-rose-500 mb-3" />
            <p className="text-sm text-gray-300">
              {host ? 'Turn on your camera to start broadcasting.' : 'Waiting for the broadcaster…'}
            </p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      {host ? (
        <div className="bg-gray-900/95">
          <ControlBar
            variation="minimal"
            controls={{ microphone: true, camera: true, screenShare: true, chat: false, leave: true }}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 px-3 py-3 bg-gray-900/95 text-gray-400 text-xs">
          <MessageSquare size={14} /> Live chat coming soon
        </div>
      )}
    </div>
  );
}
