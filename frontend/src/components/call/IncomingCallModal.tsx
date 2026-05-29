'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Phone, Video, PhoneOff } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Avatar } from '@/components/ui/Avatar';
import { callHref } from '@/lib/calls';

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
  const router = useRouter();
  const pathname = usePathname();
  const [invite, setInvite] = useState<Invite | null>(null);
  const ringtone = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Don't poll when logged out or already inside a call.
    if (!user || pathname?.startsWith('/call/')) {
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
  }, [user, pathname]);

  const accept = () => {
    if (!invite) return;
    const room = invite.room;
    const video = invite.video;
    setInvite(null);
    router.push(callHref(room, video));
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
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white shadow-2xl p-6 text-center animate-in fade-in slide-in-from-bottom-4">
        <div className="flex justify-center mb-4">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-purple-400/40 animate-ping" />
            <Avatar
              src={invite.caller.avatarUrl ?? undefined}
              alt={invite.caller.displayName}
              size="xl"
            />
          </div>
        </div>
        <h2 className="text-lg font-bold text-gray-900">{invite.caller.displayName}</h2>
        <p className="text-sm text-gray-500 mb-1">@{invite.caller.username}</p>
        <p className="text-sm font-medium text-purple-600 mb-6 flex items-center justify-center gap-1.5">
          {invite.video ? <Video size={15} /> : <Phone size={15} />}
          Incoming {invite.group ? 'group ' : ''}
          {invite.video ? 'video call' : 'voice call'}…
        </p>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={decline}
            className="flex flex-col items-center gap-1.5"
            title="Decline"
          >
            <span className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-colors">
              <PhoneOff size={22} />
            </span>
            <span className="text-xs text-gray-500">Decline</span>
          </button>
          <button
            onClick={accept}
            className="flex flex-col items-center gap-1.5"
            title="Accept"
          >
            <span className="w-14 h-14 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg transition-colors">
              {invite.video ? <Video size={22} /> : <Phone size={22} />}
            </span>
            <span className="text-xs text-gray-500">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
}
