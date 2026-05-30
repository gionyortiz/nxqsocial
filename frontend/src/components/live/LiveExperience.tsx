'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RoomAudioRenderer,
  GridLayout,
  ParticipantTile,
  TrackToggle,
  useTracks,
  useParticipants,
  useDataChannel,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import {
  Radio,
  Users,
  Link2,
  Check,
  X,
  Heart,
  Send,
  Video,
  Mic,
  MonitorUp,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';

/** Quick reactions a viewer can tap. */
const QUICK_EMOJIS = ['❤️', '😂', '😮', '👏', '🔥', '🎉'];
const MAX_CHAT = 60;

type LiveEvent =
  | {
      kind: 'chat';
      id: string;
      name: string;
      username: string;
      avatar?: string | null;
      text: string;
      ts: number;
    }
  | { kind: 'reaction'; id: string; emoji: string; ts: number };

interface ChatMessage {
  id: string;
  name: string;
  username: string;
  avatar?: string | null;
  text: string;
  ts: number;
}

interface FloatReaction {
  id: string;
  emoji: string;
  left: number;
  drift: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function LiveExperience({
  host,
  room,
  onLeave,
}: {
  host: boolean;
  room: string;
  onLeave: () => void;
}) {
  const { user } = useAuthStore();
  const participants = useParticipants();
  const cameraTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  const [copied, setCopied] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<FloatReaction[]>([]);
  const [draft, setDraft] = useState('');

  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Viewers = everyone except the broadcaster.
  const viewers = Math.max(0, participants.length - 1);

  // ---- Realtime over the LiveKit data channel ----------------------------
  const handleData = useCallback((msg: { payload: Uint8Array }) => {
    let evt: LiveEvent;
    try {
      evt = JSON.parse(decoder.decode(msg.payload)) as LiveEvent;
    } catch {
      return;
    }
    if (evt.kind === 'chat') {
      setMessages((prev) => [...prev, evt].slice(-MAX_CHAT));
    } else if (evt.kind === 'reaction') {
      addFloatingReaction(evt.emoji);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { send } = useDataChannel(handleData);

  const broadcast = useCallback(
    (evt: LiveEvent, reliable: boolean) => {
      try {
        void send(encoder.encode(JSON.stringify(evt)), { reliable });
      } catch {
        /* ignore send failures */
      }
    },
    [send],
  );

  const addFloatingReaction = (emoji: string) => {
    const item: FloatReaction = {
      id: randomId(),
      emoji,
      left: 4 + Math.random() * 16, // % from right edge area
      drift: Math.random() * 40 - 20,
    };
    setReactions((prev) => [...prev, item].slice(-40));
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== item.id));
    }, 3200);
  };

  const sendReaction = (emoji: string) => {
    addFloatingReaction(emoji); // optimistic / show our own
    broadcast({ kind: 'reaction', id: randomId(), emoji, ts: Date.now() }, false);
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    const evt: ChatMessage = {
      id: randomId(),
      name: user?.displayName ?? user?.username ?? 'You',
      username: user?.username ?? 'you',
      avatar: user?.avatarUrl ?? null,
      text: text.slice(0, 300),
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, evt].slice(-MAX_CHAT));
    broadcast({ kind: 'chat', ...evt }, true);
    setDraft('');
  };

  // Auto-scroll chat to the newest message.
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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

  const hasVideo = cameraTracks.length > 0;

  const keyframes = useMemo(
    () => `
    @keyframes nxqFloatUp {
      0%   { transform: translateY(0) scale(0.6); opacity: 0; }
      12%  { opacity: 1; transform: translateY(-10px) scale(1.05); }
      100% { transform: translateY(-220px) scale(1.25); opacity: 0; }
    }
    @keyframes nxqChatIn {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `,
    [],
  );

  return (
    <div className="relative h-full w-full bg-black overflow-hidden">
      <style>{keyframes}</style>

      {/* Video stage (full bleed) */}
      <div className="absolute inset-0">
        {hasVideo ? (
          <GridLayout tracks={cameraTracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
            <Radio size={40} className="text-rose-500 mb-3 animate-pulse" />
            <p className="text-sm text-gray-300">
              {host
                ? 'Turn on your camera below to start broadcasting.'
                : 'Waiting for the broadcaster to start…'}
            </p>
          </div>
        )}
      </div>
      <RoomAudioRenderer />

      {/* Top gradient + bar */}
      <div className="absolute top-0 inset-x-0 z-20 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 px-3 py-2.5 text-white">
          <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-600 text-white text-xs font-bold shadow">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
          </span>
          <span className="flex items-center gap-1 text-sm font-medium bg-black/30 px-2 py-1 rounded-full">
            <Users size={15} /> {viewers}
          </span>
          <div className="flex-1" />
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-xs font-medium"
          >
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
          </button>
          <button
            onClick={onLeave}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500 hover:bg-rose-600 text-xs font-semibold"
          >
            <X size={14} /> {host ? 'End' : 'Leave'}
          </button>
        </div>
      </div>

      {/* Floating reactions layer */}
      <div className="pointer-events-none absolute bottom-24 right-2 z-20 w-24 h-72">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute bottom-0 text-3xl"
            style={{
              right: `${r.left}px`,
              animation: 'nxqFloatUp 3s ease-out forwards',
              marginLeft: `${r.drift}px`,
            }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Chat overlay */}
      <div className="absolute bottom-20 left-0 right-0 z-20 px-3 pointer-events-none">
        <div
          ref={chatScrollRef}
          className="max-h-48 sm:max-h-60 overflow-y-auto flex flex-col gap-1.5 pr-1 no-scrollbar"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className="self-start max-w-[85%] flex items-start gap-2 bg-black/45 backdrop-blur-sm rounded-2xl px-2.5 py-1.5"
              style={{ animation: 'nxqChatIn 0.18s ease-out' }}
            >
              <span className="text-xs font-bold text-rose-300 shrink-0">{m.name}</span>
              <span className="text-xs text-white/95 break-words">{m.text}</span>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="self-start text-[11px] text-white/50 bg-black/30 rounded-full px-3 py-1">
              {host ? 'Say hi to your viewers 👋' : 'Be the first to comment 👋'}
            </p>
          )}
        </div>
      </div>

      {/* Bottom control bar */}
      <div className="absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center gap-2 px-3 pb-3 pt-6">
          {/* Chat input (everyone) */}
          <div className="flex-1 flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full pl-3 pr-1.5 py-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') sendChat();
              }}
              maxLength={300}
              placeholder="Add a comment…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none"
            />
            <button
              onClick={sendChat}
              disabled={!draft.trim()}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white shrink-0"
            >
              <Send size={15} />
            </button>
          </div>

          {/* Host media controls */}
          {host && (
            <div className="flex items-center gap-1.5">
              <TrackToggle
                source={Track.Source.Microphone}
                showIcon={false}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <Mic size={18} />
              </TrackToggle>
              <TrackToggle
                source={Track.Source.Camera}
                showIcon={false}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <Video size={18} />
              </TrackToggle>
              <TrackToggle
                source={Track.Source.ScreenShare}
                showIcon={false}
                className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 text-white"
              >
                <MonitorUp size={18} />
              </TrackToggle>
            </div>
          )}

          {/* Heart / reaction button (everyone) */}
          <button
            onClick={() => sendReaction('❤️')}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 transition text-white shrink-0 shadow-lg"
            aria-label="Send a heart"
          >
            <Heart size={20} fill="currentColor" />
          </button>
        </div>

        {/* Quick emoji row */}
        <div className="flex items-center justify-center gap-1.5 pb-3">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => sendReaction(e)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 transition text-lg"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
