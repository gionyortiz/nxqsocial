'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Gift,
  Flag,
  Hand,
  UserPlus,
  Music,
  VolumeX,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { startLiveSession, endLiveSession, liveHeartbeat } from '@/lib/live';
import { api } from '@/lib/api';
import { trackEvent } from '@/lib/analytics';

/** Quick reactions a viewer can tap. */
const QUICK_EMOJIS = ['❤️', '😂', '😮', '👏', '🔥', '🎉'];
/** Gift "stickers" — bigger center-screen bursts. */
const GIFTS = ['🎁', '🌹', '💎', '👑', '🚀', '🦄'];

/** Royalty-free background music — SoundHelix (free for any use, no CORS issues). */
const MUSIC_TRACKS = [
  { id: 'lofi1',   label: 'Lo-Fi Chill',   url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3' },
  { id: 'hiphop1', label: 'Hip Hop Vibe',  url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { id: 'upbeat1', label: 'Upbeat Pop',    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { id: 'chill1',  label: 'Chill Beats',   url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3' },
  { id: 'party1',  label: 'Party Mix',     url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
];
const MAX_CHAT = 60;
const HEARTBEAT_MS = 15_000;

type LiveEvent =
  | {
      kind: 'chat';
      id: string;
      name: string;
      username: string;
      text: string;
      ts: number;
    }
  | { kind: 'reaction'; id: string; emoji: string; ts: number }
  | { kind: 'gift'; id: string; emoji: string; name: string; ts: number }
  | { kind: 'guest-request'; id: string; userId: string; name: string; ts: number }
  | { kind: 'guest-approve'; id: string; userId: string; ts: number }
  | { kind: 'battle-start'; id: string; durationSec: number; ts: number }
  | { kind: 'battle-vote'; id: string; side: 0 | 1; name: string; emoji: string; ts: number }
  | { kind: 'battle-end'; id: string; ts: number };

interface ChatMessage {
  id: string;
  name: string;
  username: string;
  text: string;
  ts: number;
  gift?: string;
}

interface FloatReaction {
  id: string;
  emoji: string;
  left: number;
  drift: number;
}

interface GiftBurst {
  id: string;
  emoji: string;
  name: string;
}

interface GuestRequest {
  userId: string;
  name: string;
}

interface GuestRequestRecord {
  userId: string;
  displayName?: string;
  name?: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function nowMs() {
  return new Date().getTime();
}

function randomId() {
  return `${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function LiveExperience({
  host,
  isOwner,
  room,
  onLeave,
}: {
  host: boolean;
  isOwner: boolean;
  room: string;
  onLeave: () => void;
}) {
  const { user } = useAuthStore();
  const router = useRouter();
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
  const [gifts, setGifts] = useState<GiftBurst[]>([]);
  const [draft, setDraft] = useState('');
  const [showGifts, setShowGifts] = useState(false);
  const [guestRequests, setGuestRequests] = useState<GuestRequest[]>([]);
  const [requestedToJoin, setRequestedToJoin] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [showMusic, setShowMusic] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(0.4);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showInvitePanel, setShowInvitePanel] = useState(false);

  // ---- Battle state -------------------------------------------------------
  const [battleActive, setBattleActive] = useState(false);
  const [battleTimeLeft, setBattleTimeLeft] = useState(0);
  const [battleScores, setBattleScores] = useState<[number, number]>([0, 0]);
  const battleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const liveStartedAtRef = useRef<number>(0);
  const peakViewersRef = useRef<number>(0);
  const chatCountRef = useRef<number>(0);
  // Keep a ref to user.id so handleData always has the latest value (avoids stale closure)
  const userIdRef = useRef<string | undefined>(user?.id);
  useEffect(() => { userIdRef.current = user?.id; }, [user?.id]);

  const buildGuestJoinHref = useCallback(() => {
    const search = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    search.set('host', '1');
    search.set('guest', '1');
    return `/live/${encodeURIComponent(room)}?${search.toString()}`;
  }, [room]);

  // Viewers = everyone except the broadcaster(s) (camera publishers).
  const publishers = new Set(cameraTracks.map((t) => t.participant?.identity));
  const viewers = Math.max(0, participants.length - Math.max(1, publishers.size));

  // The owner's identity = the participant publishing the primary camera.
  const hostIdentity = cameraTracks[0]?.participant?.identity ?? null;

  // ---- Reaction / gift visuals -------------------------------------------
  const addFloatingReaction = useCallback((emoji: string) => {
    const item: FloatReaction = {
      id: randomId(),
      emoji,
      left: 4 + Math.random() * 16,
      drift: Math.random() * 40 - 20,
    };
    setReactions((prev) => [...prev, item].slice(-40));
    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== item.id));
    }, 3200);
  }, []);

  const addGiftBurst = useCallback((emoji: string, name: string) => {
    const item: GiftBurst = { id: randomId(), emoji, name };
    setGifts((prev) => [...prev, item].slice(-6));
    setTimeout(() => {
      setGifts((prev) => prev.filter((g) => g.id !== item.id));
    }, 3500);
  }, []);

  // ---- Realtime over the LiveKit data channel ----------------------------
  const handleData = useCallback(
    (msg: { payload: Uint8Array }) => {
      let evt: LiveEvent;
      try {
        evt = JSON.parse(decoder.decode(msg.payload)) as LiveEvent;
      } catch {
        return;
      }
      switch (evt.kind) {
        case 'chat':
          setMessages((prev) => [...prev, evt].slice(-MAX_CHAT));
          break;
        case 'reaction':
          addFloatingReaction(evt.emoji);
          break;
        case 'gift':
          addGiftBurst(evt.emoji, evt.name);
          setMessages((prev) =>
            [
              ...prev,
              {
                id: evt.id,
                name: evt.name,
                username: '',
                text: `sent a ${evt.emoji}`,
                ts: evt.ts,
                gift: evt.emoji,
              },
            ].slice(-MAX_CHAT),
          );
          break;
        case 'guest-request':
          if (isOwner) {
            setGuestRequests((prev) =>
              prev.some((r) => r.userId === evt.userId)
                ? prev
                : [...prev, { userId: evt.userId, name: evt.name }],
            );
          }
          break;
        case 'guest-approve':
          // Use ref to avoid stale closure on user?.id
          if (!host && evt.userId === userIdRef.current) {
            router.push(buildGuestJoinHref());
          }
          break;
        case 'battle-start':
          setBattleActive(true);
          setBattleScores([0, 0]);
          setBattleTimeLeft(evt.durationSec);
          if (battleTimerRef.current) clearInterval(battleTimerRef.current);
          battleTimerRef.current = setInterval(() => {
            setBattleTimeLeft(t => {
              if (t <= 1) {
                clearInterval(battleTimerRef.current!);
                setBattleActive(false);
                return 0;
              }
              return t - 1;
            });
          }, 1000);
          break;
        case 'battle-vote':
          setBattleScores(prev => {
            const next: [number, number] = [...prev] as [number, number];
            next[evt.side] += 1;
            return next;
          });
          addGiftBurst(evt.emoji, evt.name);
          break;
        case 'battle-end':
          setBattleActive(false);
          setBattleTimeLeft(0);
          if (battleTimerRef.current) clearInterval(battleTimerRef.current);
          break;
      }
    },
    [addFloatingReaction, addGiftBurst, isOwner, host, router, buildGuestJoinHref],
  );

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

  // ---- Owner lifecycle: register live session + heartbeat ----------------
  const viewersRef = useRef(viewers);
  useEffect(() => {
    viewersRef.current = viewers;
    peakViewersRef.current = Math.max(peakViewersRef.current, viewers);
  }, [viewers]);

  useEffect(() => {
    if (!isOwner) return;
    let stopped = false;
    liveStartedAtRef.current = nowMs();
    peakViewersRef.current = viewersRef.current;
    chatCountRef.current = 0;
    void startLiveSession(room);
    const beat = () => {
      if (stopped) return;
      void liveHeartbeat(room, viewersRef.current);
    };
    beat();
    const id = setInterval(beat, HEARTBEAT_MS);

    // Safety net: if the tab is closed without clicking End, send a beacon
    // to mark the session ended. navigator.sendBeacon works during unload.
    const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api').replace(/\/+$/, '');
    const endUrl = `${apiBase}/live/${encodeURIComponent(room)}/end`;
    const handleUnload = () => {
      try {
        const token = typeof window !== 'undefined'
          ? (JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.token ?? '')
          : '';
        navigator.sendBeacon(endUrl + `?_beacon=1&token=${token}`);
      } catch {
        // best-effort
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      void endLiveSession(room);
      const durationSec = Math.max(0, Math.round((nowMs() - liveStartedAtRef.current) / 1000));
      const payload = {
        room,
        durationSec,
        peakViewers: peakViewersRef.current,
        chatMessages: chatCountRef.current,
      };
      void trackEvent('live_duration', payload);
      void trackEvent('peak_viewers', payload);
      void trackEvent('chat_messages', payload);
    };
  }, [isOwner, room]);

  // ---- Actions -----------------------------------------------------------
  const sendReaction = (emoji: string) => {
    addFloatingReaction(emoji);
    broadcast({ kind: 'reaction', id: randomId(), emoji, ts: nowMs() }, false);
  };

  const playMusic = (trackId: string) => {
    const track = MUSIC_TRACKS.find(t => t.id === trackId);
    if (!track) return;

    // Stop current music
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current = null;
    }

    if (playingTrackId === trackId) {
      // Toggle off
      setPlayingTrackId(null);
      return;
    }

    const audio = new Audio(track.url);
    audio.loop = true;
    audio.volume = musicVolume;
    audio.play().catch(() => {});
    musicAudioRef.current = audio;
    setPlayingTrackId(trackId);
  };

  const stopMusic = () => {
    if (musicAudioRef.current) {
      musicAudioRef.current.pause();
      musicAudioRef.current = null;
    }
    setPlayingTrackId(null);
  };

  // Keep volume in sync
  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  // Stop music when host leaves
  useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current = null;
      }
    };
  }, []);

  const sendGift = (emoji: string) => {
    const name = user?.displayName ?? user?.username ?? 'Someone';
    addGiftBurst(emoji, name);
    broadcast({ kind: 'gift', id: randomId(), emoji, name, ts: nowMs() }, true);
    setShowGifts(false);
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    const evt: ChatMessage = {
      id: randomId(),
      name: user?.displayName ?? user?.username ?? 'You',
      username: user?.username ?? 'you',
      text: text.slice(0, 300),
      ts: nowMs(),
    };
    setMessages((prev) => [...prev, evt].slice(-MAX_CHAT));
    chatCountRef.current += 1;
    broadcast({ kind: 'chat', ...evt }, true);
    setDraft('');
  };

  // sessionStorage key so polling survives page refreshes within the same tab
  const ssRequestKey = `nxq_live_req:${room}`;

  const clearMyGuestState = useCallback(async (updateLocal = true) => {
    if (isOwner || !userIdRef.current) return;
    try {
      sessionStorage.removeItem(ssRequestKey);
    } catch {
      // ignore
    }
    if (updateLocal) setRequestedToJoin(false);
    try {
      await api.post(`/live/${encodeURIComponent(room)}/guest-leave`);
    } catch {
      // best-effort cleanup
    }
  }, [isOwner, room, ssRequestKey]);

  const leaveLive = useCallback(() => {
    void clearMyGuestState();
    onLeave();
  }, [clearMyGuestState, onLeave]);

  const requestToJoin = async () => {
    if (!user) return;
    // Persist across possible page refresh
    sessionStorage.setItem(ssRequestKey, '1');
    setRequestedToJoin(true);
    try {
      // POST to backend — reliable cross-device
      await api.post(`/live/${encodeURIComponent(room)}/guest-request`, {
        displayName: user.displayName ?? user.username,
      });
    } catch {
      // Fallback: data channel
      broadcast(
        {
          kind: 'guest-request',
          id: randomId(),
          userId: user.id,
          name: user.displayName ?? user.username,
          ts: nowMs(),
        },
        true,
      );
    }
    // Also send via data channel as a backup
    broadcast(
      {
        kind: 'guest-request',
        id: randomId(),
        userId: user.id,
        name: user.displayName ?? user.username,
        ts: nowMs(),
      },
      true,
    );
  };

  const approveGuest = async (g: GuestRequest) => {
    try {
      // Write to backend — guest is polling this
      await api.post(`/live/${encodeURIComponent(room)}/guest-approve`, { userId: g.userId });
    } catch { /* ignore */ }
    // Also send via data channel as backup
    broadcast({ kind: 'guest-approve', id: randomId(), userId: g.userId, ts: nowMs() }, true);
    setGuestRequests((prev) => prev.filter((r) => r.userId !== g.userId));
  };

  const rejectGuest = async (g: GuestRequest) => {
    setGuestRequests((prev) => prev.filter((r) => r.userId !== g.userId));
    try {
      await api.post(`/live/${encodeURIComponent(room)}/guest-clear`, { userId: g.userId });
    } catch {
      // best-effort cleanup
    }
  };

  const startBattle = (durationSec = 60) => {
    const evt = { kind: 'battle-start' as const, id: randomId(), durationSec, ts: nowMs() };
    setBattleActive(true);
    setBattleScores([0, 0]);
    setBattleTimeLeft(durationSec);
    broadcast(evt, true);
    if (battleTimerRef.current) clearInterval(battleTimerRef.current);
    battleTimerRef.current = setInterval(() => {
      setBattleTimeLeft(t => {
        if (t <= 1) { clearInterval(battleTimerRef.current!); setBattleActive(false); return 0; }
        return t - 1;
      });
    }, 1000);
  };

  const endBattle = () => {
    setBattleActive(false);
    setBattleTimeLeft(0);
    if (battleTimerRef.current) clearInterval(battleTimerRef.current);
    broadcast({ kind: 'battle-end', id: randomId(), ts: nowMs() }, true);
  };

  const sendBattleVote = (side: 0 | 1, emoji: string) => {
    const name = user?.displayName ?? user?.username ?? 'Someone';
    broadcast({ kind: 'battle-vote', id: randomId(), side, name, emoji, ts: nowMs() }, true);
    setBattleScores(prev => { const n: [number, number] = [...prev] as [number, number]; n[side] += 1; return n; });
    addGiftBurst(emoji, name);
  };

  // Cleanup battle timer on unmount
  useEffect(() => () => { if (battleTimerRef.current) clearInterval(battleTimerRef.current); }, []);

  // Host: poll backend for guest requests every 3s (more reliable than data channel)
  useEffect(() => {
    if (!isOwner) return;
    const poll = async () => {
      try {
        const { data } = await api.get(`/live/${encodeURIComponent(room)}/guest-requests`);
        if (Array.isArray(data)) {
          setGuestRequests(
            (data as GuestRequestRecord[]).map((d) => ({
              userId: d.userId,
              name: d.displayName ?? d.name ?? 'Viewer',
            })),
          );
        }
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [isOwner, room]);

  // On mount/re-entry: ask backend for real guest status so stale local state
  // does not permanently hide the Join button.
  useEffect(() => {
    if (host || isOwner || !user?.id) return;
    let cancelled = false;
    api.get(`/live/${encodeURIComponent(room)}/guest-status`)
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.approved) {
          sessionStorage.removeItem(ssRequestKey);
          router.push(buildGuestJoinHref());
          return;
        }
        if (data?.pending) {
          sessionStorage.setItem(ssRequestKey, '1');
          setRequestedToJoin(true);
          return;
        }
        sessionStorage.removeItem(ssRequestKey);
        setRequestedToJoin(false);
      })
      .catch(() => {
        if (!cancelled && sessionStorage.getItem(ssRequestKey)) {
          setRequestedToJoin(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [host, isOwner, room, user?.id, router, buildGuestJoinHref, ssRequestKey]);

  // Guest: poll backend every 2s to check if host approved them
  useEffect(() => {
    if (!requestedToJoin || host || !user?.id) return;
    const ssKey = `nxq_live_req:${room}`;
    let redirected = false;
    const poll = async () => {
      if (redirected) return;
      try {
        const { data } = await api.get(`/live/${encodeURIComponent(room)}/guest-check`);
        if (data?.approved && !redirected) {
          redirected = true;
          sessionStorage.removeItem(ssKey);
          router.push(buildGuestJoinHref());
        }
      } catch (err) {
        // Log in dev so we can see auth/network errors
        if (process.env.NODE_ENV !== 'production') console.error('[guest-check poll]', err);
      }
    };
    poll(); // poll immediately
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [requestedToJoin, host, room, router, user?.id, buildGuestJoinHref]);

  useEffect(() => () => { void clearMyGuestState(false); }, [clearMyGuestState]);

  const reportLive = async () => {
    if (!hostIdentity || hostIdentity === user?.id) return;
    setReporting(true);
    try {
      await api.post('/reports', {
        reason: 'OTHER',
        description: `Reported live broadcast in room ${room}`,
        reportedUserId: hostIdentity,
      });
      setReported(true);
    } catch {
      /* ignore */
    } finally {
      setReporting(false);
    }
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
    @keyframes nxqGiftPop {
      0%   { transform: scale(0.2) translateY(60px) rotate(0deg); opacity: 0; }
      15%  { transform: scale(1.3) translateY(0px) rotate(-5deg); opacity: 1; }
      30%  { transform: scale(1.1) translateY(-10px) rotate(3deg); opacity: 1; }
      60%  { transform: scale(1) translateY(-80px) rotate(-2deg); opacity: 1; }
      85%  { transform: scale(0.8) translateY(-200px) rotate(8deg); opacity: 0.6; }
      100% { transform: scale(0.3) translateY(-320px) rotate(15deg); opacity: 0; }
    }
    /* Make live video fill the frame instead of letterboxing (TikTok/IG style) */
    .lk-participant-tile, .lk-participant-media-video {
      width: 100% !important;
      height: 100% !important;
    }
    .lk-participant-media-video {
      object-fit: cover !important;
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
          cameraTracks.length === 1 ? (
            // Single host — full screen
            <GridLayout tracks={cameraTracks} style={{ height: '100%' }}>
              <ParticipantTile />
            </GridLayout>
          ) : (
            <>
              {/* MOBILE co-host (non-battle): main video full-screen + floating PiP */}
              {!battleActive && (
                <div className="md:hidden relative h-full w-full">
                  {/* Main video fills the screen */}
                  <GridLayout tracks={[cameraTracks[0]]} style={{ height: '100%', width: '100%' }}>
                    <ParticipantTile />
                  </GridLayout>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-semibold z-10">
                    {host ? 'You' : 'Host'}
                  </div>
                  {/* Floating picture-in-picture for the second participant */}
                  <div className="absolute top-16 right-3 w-24 h-36 rounded-2xl overflow-hidden border-2 border-white/25 shadow-2xl z-20 bg-black">
                    <GridLayout tracks={[cameraTracks[1]]} style={{ height: '100%', width: '100%' }}>
                      <ParticipantTile />
                    </GridLayout>
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-semibold">
                      Guest
                    </div>
                  </div>
                </div>
              )}

              {/* DESKTOP split (and MOBILE battle VS): side-by-side columns */}
              <div className={`${battleActive ? 'flex' : 'hidden md:flex'} h-full w-full`}>
                {cameraTracks.slice(0, 2).map((track, i) => (
                  <div key={track.participant?.identity ?? i} className="flex-1 relative overflow-hidden border-r border-white/10 last:border-r-0">
                    <GridLayout tracks={[track]} style={{ height: '100%', width: '100%' }}>
                      <ParticipantTile />
                    </GridLayout>
                    {/* Name tag */}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-semibold">
                      {i === 0 ? (host ? 'You' : 'Host') : 'Guest'}
                    </div>
                    {/* Battle score */}
                    {battleActive && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-2xl font-black text-white drop-shadow-lg">
                        {battleScores[i]}
                      </div>
                    )}
                    {/* Viewer vote buttons during battle */}
                    {battleActive && !host && (
                      <button
                        onClick={() => sendBattleVote(i as 0 | 1, i === 0 ? '🔥' : '⚡')}
                        className="absolute bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white text-sm font-bold shadow-lg hover:opacity-90 transition"
                      >
                        Vote {i === 0 ? '🔥' : '⚡'}
                      </button>
                    )}
                  </div>
                ))}

                {/* Battle scorebar center divider */}
                {battleActive && (
                  <div className="absolute inset-x-0 top-0 z-10 flex flex-col items-center pointer-events-none">
                    <div className="flex items-center gap-0 w-full h-2">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-orange-500 transition-all duration-300"
                        style={{ width: `${battleScores[0] + battleScores[1] === 0 ? 50 : Math.round(battleScores[0] / (battleScores[0] + battleScores[1]) * 100)}%` }}
                      />
                      <div className="flex-1 h-full bg-gradient-to-r from-purple-500 to-fuchsia-500" />
                    </div>
                    <div className="mt-1 px-3 py-1 rounded-full bg-black/70 text-white text-xs font-bold flex items-center gap-2">
                      ⚔️ BATTLE
                      <span className="text-amber-400">{Math.floor(battleTimeLeft / 60)}:{String(battleTimeLeft % 60).padStart(2, '0')}</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )
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
          {!host && (
            <button
              onClick={reportLive}
              disabled={reporting || reported}
              title="Report this live"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-medium disabled:opacity-60"
            >
              <Flag size={13} />
              <span className="hidden sm:inline">{reported ? 'Reported' : 'Report'}</span>
            </button>
          )}
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-xs font-medium"
          >
            {copied ? <Check size={14} /> : <Link2 size={14} />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Share'}</span>
          </button>
          <button
            onClick={leaveLive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-500 hover:bg-rose-600 text-xs font-semibold"
          >
            <X size={14} /> {isOwner ? 'End' : 'Leave'}
          </button>
        </div>

        {/* Owner: pending guest join requests */}
        {isOwner && guestRequests.length > 0 && (
          <div className="px-3 pb-2 flex flex-col gap-1.5">
            {guestRequests.map((g) => (
              <div
                key={g.userId}
                className="flex items-center gap-2 bg-black/50 backdrop-blur rounded-xl px-3 py-2"
              >
                <Hand size={15} className="text-amber-300 shrink-0" />
                <span className="text-xs text-white flex-1 truncate">
                  <b>{g.name}</b> wants to join your live
                </span>
                <button
                  onClick={() => approveGuest(g)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold"
                >
                  <UserPlus size={13} /> Add
                </button>
                <button
                  onClick={() => { void rejectGuest(g); }}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs"
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gift bursts (center) */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2">
        {gifts.map((g) => (
          <div
            key={g.id}
            className="flex flex-col items-center"
            style={{ animation: 'nxqGiftPop 3.5s cubic-bezier(0.22,1,0.36,1) forwards' }}
          >
            <span className="text-8xl drop-shadow-2xl filter">{g.emoji}</span>
            <span className="text-xs font-bold text-white bg-black/60 rounded-full px-3 py-1 mt-1 shadow-lg">
              {g.name} sent a gift
            </span>
          </div>
        ))}
      </div>

      {/* Floating reactions layer */}
      <div className="pointer-events-none absolute bottom-28 right-2 z-20 w-24 h-72">
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
      <div className="absolute bottom-24 left-0 right-0 z-20 px-3 pointer-events-none">
        <div
          ref={chatScrollRef}
          className="max-h-48 sm:max-h-60 overflow-y-auto flex flex-col gap-1.5 pr-1 no-scrollbar"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`self-start max-w-[85%] flex items-start gap-2 backdrop-blur-sm rounded-2xl px-2.5 py-1.5 ${
                m.gift ? 'bg-amber-500/30' : 'bg-black/45'
              }`}
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

      {/* Gift tray */}
      {showGifts && (
        <div className="absolute bottom-20 left-0 right-0 z-30 px-3">
          <div className="mx-auto max-w-sm bg-black/70 backdrop-blur rounded-2xl p-3 grid grid-cols-6 gap-2">
            {GIFTS.map((g) => (
              <button
                key={g}
                onClick={() => sendGift(g)}
                className="aspect-square rounded-xl bg-white/10 hover:bg-white/20 active:scale-90 transition text-2xl flex items-center justify-center"
              >
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Invite panel (host only) */}
      {showInvitePanel && host && (
        <div className="absolute bottom-20 left-0 right-0 z-30 px-3">
          <div className="mx-auto max-w-sm bg-black/85 backdrop-blur-xl rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-bold flex items-center gap-2">
                <UserPlus size={15} className="text-green-400" /> Invite to go live
              </span>
              <span className="text-xs text-gray-400">{viewers} viewer{viewers !== 1 ? 's' : ''}</span>
            </div>

            {/* Pending requests */}
            {guestRequests.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] text-amber-400 font-bold uppercase tracking-wide">Wants to join</p>
                {guestRequests.map((g) => (
                  <div key={g.userId} className="flex items-center gap-3 bg-amber-500/10 rounded-xl px-3 py-2">
                    <Hand size={14} className="text-amber-400 shrink-0" />
                    <span className="text-sm text-white flex-1 font-semibold truncate">{g.name}</span>
                    <button
                      onClick={() => { approveGuest(g); setShowInvitePanel(false); }}
                      className="px-3 py-1.5 rounded-full bg-green-500 hover:bg-green-600 text-white text-xs font-bold"
                    >
                      ✓ Add
                    </button>
                    <button
                      onClick={() => { void rejectGuest(g); }}
                      className="px-2 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {guestRequests.length === 0 && viewers === 0 && (
              <p className="text-center text-gray-500 text-sm py-4">No viewers yet. Share your live link to get people watching!</p>
            )}

            {guestRequests.length === 0 && viewers > 0 && (
              <p className="text-center text-gray-400 text-sm py-3">
                Viewers can tap the <Hand size={13} className="inline text-amber-300" /> button to request to join.<br />
                Their request will appear here.
              </p>
            )}

            {/* Share link — direct guest join URL as backup */}
            <div className="space-y-1.5">
              <button
                onClick={() => {
                  const base = typeof window !== 'undefined' ? window.location.origin : '';
                  const guestUrl = `${base}/live/${encodeURIComponent(room)}?host=1&guest=1`;
                  navigator.clipboard?.writeText(guestUrl).catch(() => {});
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-green-600/30 hover:bg-green-600/50 text-green-300 text-sm font-semibold transition-colors border border-green-600/40"
              >
                <Link2 size={14} /> Copy guest join link (send to them)
              </button>
              <button
                onClick={() => {
                  const url = typeof window !== 'undefined' ? window.location.href.replace('?host=1', '') : '';
                  navigator.clipboard?.writeText(url).catch(() => {});
                }}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-medium transition-colors"
              >
                <Link2 size={13} /> Copy viewer link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Music tray (host only) */}
      {showMusic && host && (
        <div className="absolute bottom-20 left-0 right-0 z-30 px-3">
          <div className="mx-auto max-w-sm bg-black/80 backdrop-blur-xl rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-bold flex items-center gap-2">
                <Music size={15} className="text-purple-400" /> Background Music
              </span>
              {playingTrackId && (
                <button onClick={stopMusic} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300">
                  <VolumeX size={13} /> Stop
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {MUSIC_TRACKS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => playMusic(t.id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
                    playingTrackId === t.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <span className="text-base">{playingTrackId === t.id ? '▶️' : '🎵'}</span>
                  {t.label}
                  {playingTrackId === t.id && <span className="ml-auto text-xs opacity-70 animate-live-blink">● PLAYING</span>}
                </button>
              ))}
            </div>
            {/* Volume slider */}
            <div className="flex items-center gap-2 pt-1">
              <Music size={13} className="text-gray-400 shrink-0" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVolume}
                onChange={(e) => setMusicVolume(Number(e.target.value))}
                className="flex-1 h-1.5 accent-purple-500"
              />
              <span className="text-xs text-gray-400 w-8 text-right">{Math.round(musicVolume * 100)}%</span>
            </div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Music plays on your device only. Viewers hear it through your microphone. Use headphones to avoid echo.
            </p>
          </div>
        </div>
      )}

      {/* Bottom control bar — mobile-first, always visible */}
      <div className="absolute bottom-0 inset-x-0 z-30 bg-gradient-to-t from-black/90 to-transparent">
        {/* Chat row */}
        <div className="flex items-center gap-2 px-3 pt-4 pb-2">
          <div className="flex-1 flex items-center gap-1.5 bg-white/15 backdrop-blur rounded-full pl-3 pr-1.5 py-1">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              maxLength={300}
              placeholder="Add a comment…"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-white/50 outline-none min-w-0"
            />
            <button
              onClick={sendChat}
              disabled={!draft.trim()}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-40 text-white shrink-0"
            >
              <Send size={15} />
            </button>
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex items-center justify-start sm:justify-center gap-2.5 px-3 pb-4 overflow-x-auto no-scrollbar">
          {host ? (
            /* Host controls */
            <>
              <TrackToggle source={Track.Source.Microphone} showIcon={false}
                className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/15 hover:bg-white/25 text-white">
                <Mic size={20} />
              </TrackToggle>
              <TrackToggle source={Track.Source.Camera} showIcon={false}
                className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-white/15 hover:bg-white/25 text-white">
                <Video size={20} />
              </TrackToggle>
              <TrackToggle source={Track.Source.ScreenShare} showIcon={false}
                className="shrink-0 hidden sm:flex items-center justify-center w-12 h-12 rounded-2xl bg-white/15 hover:bg-white/25 text-white">
                <MonitorUp size={20} />
              </TrackToggle>
              <button onClick={() => setShowMusic(s => !s)}
                className={`shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl transition-colors ${playingTrackId ? 'bg-purple-500 text-white' : 'bg-white/15 text-white'}`}>
                <Music size={20} />
              </button>
              <button onClick={() => setShowInvitePanel(s => !s)}
                className={`shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl transition-colors ${showInvitePanel ? 'bg-green-500 text-white' : 'bg-white/15 text-white'}`}>
                <UserPlus size={20} />
              </button>
              {cameraTracks.length >= 2 && (
                <button onClick={() => battleActive ? endBattle() : startBattle(60)}
                  className={`shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl text-lg transition-colors ${battleActive ? 'bg-red-500 animate-pulse text-white' : 'bg-gradient-to-br from-rose-500 to-orange-500 text-white'}`}>
                  ⚔️
                </button>
              )}
            </>
          ) : (
            /* Viewer controls — ✋ is the hero button */
            <>
              {/* Request to join — BIG prominent button */}
              <button
                onClick={requestToJoin}
                disabled={requestedToJoin}
                className={`shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm transition-all ${
                  requestedToJoin
                    ? 'bg-amber-500/20 text-amber-300 cursor-default border border-amber-500/40'
                    : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg hover:opacity-90 active:scale-95'
                }`}
              >
                {requestedToJoin ? (
                  <>
                    <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                    Waiting for host…
                  </>
                ) : (
                  <>
                    <Hand size={18} />
                    Join Live
                  </>
                )}
              </button>
            </>
          )}

          {/* Gift button — everyone */}
          <button onClick={() => setShowGifts(s => !s)}
            className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-400 hover:bg-amber-500 active:scale-90 transition text-black shadow-lg">
            <Gift size={20} />
          </button>

          {/* Heart — everyone */}
          <button onClick={() => sendReaction('❤️')}
            className="shrink-0 flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-90 transition text-white shadow-lg">
            <Heart size={20} fill="currentColor" />
          </button>
        </div>

        {/* Quick emoji row */}
        <div className="flex items-center justify-center gap-2 pb-3">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} onClick={() => sendReaction(e)}
              className="text-2xl active:scale-90 transition-transform hover:scale-110">
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
