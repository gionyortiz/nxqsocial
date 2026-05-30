'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Phone, Video, PhoneOff, Volume2 } from 'lucide-react';
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

export function IncomingCallModal() {
  const { user } = useAuthStore();
  const pathname = usePathname();
  const startCall = useCallStore((s) => s.start);
  const activeRoom = useCallStore((s) => s.room);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ensureCtx = (): AudioContext | null => {
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new Ctor();
        audioCtxRef.current = ctx;
      }
      return ctx;
    } catch {
      return null;
    }
  };

  // Unlock audio on the first user interaction (browsers block sound until then).
  useEffect(() => {
    const unlock = () => {
      const ctx = ensureCtx();
      if (ctx?.state === 'suspended') void ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  // Play a ringing sound + vibrate while there is an incoming call.
  useEffect(() => {
    if (!invite) return;

    const playRing = () => {
      const ctx = ensureCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        // Couldn't auto-start audio — offer a tap-to-enable button.
        void ctx.resume();
        if (ctx.state === 'suspended') {
          setSoundBlocked(true);
          try { navigator.vibrate?.([500, 250, 500]); } catch { /* ignore */ }
          return;
        }
      }
      setSoundBlocked(false);
      try {
        // Classic warbling phone ring: a ~1s burst of two alternating tones.
        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.value = 0.0001;
        master.connect(ctx.destination);
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.5, now + 0.05);
        master.gain.setValueAtTime(0.5, now + 0.95);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const warbleHz = [440, 480, 440, 480, 440, 480, 440, 480];
        warbleHz.forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * 0.12));
        osc.connect(master);
        osc.start(now);
        osc.stop(now + 1.05);
      } catch {
        /* audio not available */
      }
      try { navigator.vibrate?.([500, 250, 500]); } catch { /* ignore */ }
    };

    playRing();
    // North-American cadence: ring ~1s, silence ~2s.
    ringTimerRef.current = setInterval(playRing, 3000);

    return () => {
      if (ringTimerRef.current) clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
      try { navigator.vibrate?.(0); } catch { /* ignore */ }
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
    const ctx = ensureCtx();
    if (ctx?.state === 'suspended') void ctx.resume();
    setSoundBlocked(false);
  };

  const accept = () => {
    if (!invite) return;
    const { room, video } = invite;
    setInvite(null);
    startCall(room, video);
  };

  const decline = async () => {
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
      <div className="pointer-events-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 p-4 animate-in fade-in slide-in-from-bottom-4">
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
            <Volume2 size={14} /> Tap to enable sound
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
