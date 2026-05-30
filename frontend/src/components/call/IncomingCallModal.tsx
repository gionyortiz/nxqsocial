'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Phone, Video, PhoneOff, Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useCallStore } from '@/store/call';
import { Avatar } from '@/components/ui/Avatar';

interface Invite {
  room: string;
  caller: { username: string; displayName: string; avatarUrl?: string | null };
  video: boolean;
  group: boolean;
  createdAt: number;
}

const POLL_MS = 3000;
const RINGTONE_SRC = '/sounds/incoming-call.wav';
const VIBRATE_PATTERN = [300, 150, 300, 150, 300];

export function IncomingCallModal() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const startCall = useCallStore((s) => s.start);
  const activeRoom = useCallStore((s) => s.room);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const vibrateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lazily create the shared <audio> element (looping ringtone).
  const ensureAudio = (): HTMLAudioElement | null => {
    if (typeof window === 'undefined') return null;
    let el = audioRef.current;
    if (!el) {
      el = new Audio(RINGTONE_SRC);
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0.7;
      audioRef.current = el;
    }
    return el;
  };

  const stopRing = () => {
    const el = audioRef.current;
    if (el) {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (vibrateTimerRef.current) {
      clearInterval(vibrateTimerRef.current);
      vibrateTimerRef.current = null;
    }
    try { navigator.vibrate?.(0); } catch { /* ignore */ }
  };

  // Silently unlock/prime the ringtone on the first user interaction after login
  // (browsers block autoplay until the user has interacted with the page).
  useEffect(() => {
    const unlock = () => {
      const el = ensureAudio();
      if (!el) return;
      // Prime quietly: play muted, then immediately pause + reset. Makes no noise
      // but marks the element as "user-activated" so later play() succeeds.
      const wasMuted = el.muted;
      el.muted = true;
      el.play()
        .then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = wasMuted;
        })
        .catch(() => {
          el.muted = wasMuted;
        });
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Loop the ringtone + vibrate while there is an incoming call.
  useEffect(() => {
    if (!invite) return;

    const el = ensureAudio();
    if (el) {
      el.currentTime = 0;
      el.muted = false;
      el.play()
        .then(() => setSoundBlocked(false))
        .catch(() => {
          // Autoplay blocked — surface a "Tap to enable ringtone" button.
          setSoundBlocked(true);
        });
    }

    // Vibrate on supported devices (repeat while ringing).
    const vibrate = () => {
      try { navigator.vibrate?.(VIBRATE_PATTERN); } catch { /* ignore */ }
    };
    vibrate();
    vibrateTimerRef.current = setInterval(vibrate, 2000);

    return () => {
      stopRing();
    };
  }, [invite]);

  useEffect(() => {
    // Don't poll when logged out, on a call page, or already inside a call.
    if (!user || pathname?.startsWith('/call/') || activeRoom) {
      setInvite(null);
      return;
    }
    let active = true;
    const tick = async () => {
      try {
        const { data } = await api.get('/calls/incoming');
        if (!active) return;
        if (data && data.room) {
          setInvite((prev) => (prev?.room === data.room ? prev : data));
        } else {
          setInvite(null);
        }
      } catch {
        /* ignore poll errors */
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [user, pathname, activeRoom]);

  const enableSound = () => {
    const el = ensureAudio();
    if (!el) return;
    el.muted = false;
    el.currentTime = 0;
    el.play()
      .then(() => setSoundBlocked(false))
      .catch(() => setSoundBlocked(true));
  };

  const accept = () => {
    if (!invite) return;
    stopRing();
    const { room, video } = invite;
    setInvite(null);
    startCall(room, video);
  };

  const decline = async () => {
    stopRing();
    setInvite(null);
    try {
      await api.post('/calls/decline');
    } catch {
      /* ignore */
    }
  };

  if (!invite) return null;

  return (
    <div className="fixed z-[120] bottom-4 right-4 left-4 sm:left-auto sm:w-80 pointer-events-none">
      <div
        onClick={() => { if (soundBlocked) enableSound(); }}
        className="pointer-events-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-4 animate-in fade-in slide-in-from-bottom-4"
      >
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-full bg-purple-400/40 animate-ping" />
            <Avatar
              src={invite.caller.avatarUrl ?? undefined}
              alt={invite.caller.displayName}
              size="lg"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-gray-900 truncate">
              {invite.caller.displayName}
            </h2>
            <p className="text-xs text-gray-500 truncate">@{invite.caller.username}</p>
            <p className="text-xs font-medium text-purple-600 mt-0.5 flex items-center gap-1">
              {invite.video ? <Video size={13} /> : <Phone size={13} />}
              Incoming {invite.group ? 'group ' : ''}
              {invite.video ? 'video' : 'voice'} call…
            </p>
          </div>
        </div>

        {soundBlocked && (
          <button
            onClick={enableSound}
            className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100"
          >
            <Bell size={14} /> Enable ringtone
          </button>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={decline}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold"
          >
            <PhoneOff size={16} /> Decline
          </button>
          <button
            onClick={accept}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold"
          >
            {invite.video ? <Video size={16} /> : <Phone size={16} />} Accept
          </button>
        </div>
      </div>
    </div>
  );
}
