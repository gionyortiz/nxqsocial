'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  formatChatMessageLinks,
  useParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Minimize2, Maximize2, Square, PhoneOff, GripHorizontal } from 'lucide-react';
import { api } from '@/lib/api';
import { useCallStore } from '@/store/call';

const RINGBACK_SRC = '/sounds/outgoing-ring.wav';

interface DragPos {
  x: number;
  y: number;
}

/**
 * Runs inside the LiveKitRoom. Plays an outgoing "ringback" tone for the caller
 * while they are alone (waiting for the other person to answer), and ends the
 * call automatically once the other party leaves the room.
 */
function CallRoomInner({ onEnd }: { onEnd: () => void }) {
  const participants = useParticipants();
  const remoteCount = participants.filter((p) => !p.isLocal).length;
  const joinedRef = useRef(false);
  const ringbackRef = useRef<HTMLAudioElement | null>(null);

  // Outgoing ringback while waiting for someone to join.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let el = ringbackRef.current;
    if (!el) {
      el = new Audio(RINGBACK_SRC);
      el.loop = true;
      el.volume = 0.5;
      ringbackRef.current = el;
    }
    if (remoteCount === 0 && !joinedRef.current) {
      el.play().catch(() => {});
    } else {
      try {
        el.pause();
        el.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
  }, [remoteCount]);

  // Track whether the other party ever joined, and auto-end when they leave.
  useEffect(() => {
    if (remoteCount > 0) {
      joinedRef.current = true;
      return;
    }
    if (joinedRef.current && remoteCount === 0) {
      // The other participant hung up — close our window too.
      onEnd();
    }
  }, [remoteCount, onEnd]);

  // Stop the ringback on unmount.
  useEffect(() => {
    return () => {
      const el = ringbackRef.current;
      if (el) {
        try {
          el.pause();
          el.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return null;
}

export function FloatingCall() {
  const room = useCallStore((s) => s.room);
  const video = useCallStore((s) => s.video);
  const mode = useCallStore((s) => s.mode);
  const setMode = useCallStore((s) => s.setMode);
  const end = useCallStore((s) => s.end);

  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<DragPos | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  // Fetch a LiveKit token whenever the active room changes.
  useEffect(() => {
    if (!room) {
      setToken(null);
      setServerUrl(null);
      setError(null);
      setPos(null);
      return;
    }
    let cancelled = false;
    setToken(null);
    setServerUrl(null);
    setError(null);
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
    // Clear any pending incoming-invite for me once I join.
    api.post('/calls/decline').catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [room, video]);

  // Request browser fullscreen when entering full mode (best-effort).
  useEffect(() => {
    if (mode === 'full' && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (mode !== 'full' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [mode]);

  const onDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (mode === 'full') return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: rect.left,
        baseY: rect.top,
      };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [mode],
  );

  const onDragPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragState.current;
    if (!d) return;
    const width = containerRef.current?.offsetWidth ?? 320;
    const height = containerRef.current?.offsetHeight ?? 440;
    const nx = Math.min(
      Math.max(8, d.baseX + (e.clientX - d.startX)),
      window.innerWidth - width - 8,
    );
    const ny = Math.min(
      Math.max(8, d.baseY + (e.clientY - d.startY)),
      window.innerHeight - height - 8,
    );
    setPos({ x: nx, y: ny });
  }, []);

  const onDragPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  if (!room) return null;

  const sizeClass =
    mode === 'full'
      ? 'inset-0 w-full h-full rounded-none'
      : mode === 'medium'
        ? 'w-[min(92vw,480px)] h-[min(80vh,620px)] rounded-2xl'
        : 'w-[min(88vw,320px)] h-[min(70vh,440px)] rounded-2xl';

  // Default to bottom-right unless the user has dragged the window.
  const positionStyle: React.CSSProperties =
    mode === 'full'
      ? {}
      : pos
        ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
        : { right: 16, bottom: 16 };

  const zClass = mode === 'full' ? 'z-[200]' : 'z-[140]';

  return (
    <div
      ref={containerRef}
      style={positionStyle}
      className={`fixed ${zClass} ${sizeClass} overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 flex flex-col`}
      data-lk-theme="default"
    >
      {/* Window chrome */}
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        className={`flex items-center gap-1 px-2.5 py-1.5 bg-gray-900/95 text-white select-none ${
          mode === 'full' ? '' : 'cursor-move'
        }`}
      >
        {mode !== 'full' && <GripHorizontal size={15} className="text-gray-500 shrink-0" />}
        <span className="text-xs font-semibold flex-1 truncate">On call</span>
        <button
          onClick={() => setMode('compact')}
          title="Compact"
          className={`p-1.5 rounded-md hover:bg-white/10 ${mode === 'compact' ? 'text-purple-400' : 'text-gray-300'}`}
        >
          <Minimize2 size={15} />
        </button>
        <button
          onClick={() => setMode('medium')}
          title="Medium window"
          className={`p-1.5 rounded-md hover:bg-white/10 ${mode === 'medium' ? 'text-purple-400' : 'text-gray-300'}`}
        >
          <Square size={14} />
        </button>
        <button
          onClick={() => setMode('full')}
          title="Fullscreen"
          className={`p-1.5 rounded-md hover:bg-white/10 ${mode === 'full' ? 'text-purple-400' : 'text-gray-300'}`}
        >
          <Maximize2 size={15} />
        </button>
        <button
          onClick={end}
          title="Leave call"
          className="p-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white ml-1"
        >
          <PhoneOff size={15} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 relative">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 text-white">
            <PhoneOff size={28} className="text-red-500 mb-3" />
            <p className="text-xs text-gray-300 mb-4">{error}</p>
            <button
              onClick={end}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium"
            >
              Close
            </button>
          </div>
        ) : !token || !serverUrl ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <div className="w-7 h-7 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-xs">Connecting…</p>
          </div>
        ) : (
          <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect
            video={video}
            audio
            onDisconnected={end}
            style={{ height: '100%' }}
          >
            <CallRoomInner onEnd={end} />
            <VideoConference chatMessageFormatter={formatChatMessageLinks} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}
