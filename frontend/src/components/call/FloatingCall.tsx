'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  ParticipantTile,
  formatChatMessageLinks,
  useTracks,
  useParticipants,
} from '@livekit/components-react';
import '@livekit/components-styles';
import {
  Minimize2,
  Maximize2,
  Square,
  PhoneOff,
  GripHorizontal,
  Mic,
  MicOff,
  Video,
  Volume2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useCallStore } from '@/store/call';
import { trackEvent, trackFirstEvent } from '@/lib/analytics';
import { Avatar } from '@/components/ui/Avatar';
import { Track } from 'livekit-client';

const RINGBACK_SRC = '/sounds/outgoing-ring.wav';

interface DragPos {
  x: number;
  y: number;
}

function formatDuration(seconds: number): string {
  const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
  const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

function VoiceCallPanel({
  peerName,
  peerAvatar,
  connectedAt,
  onUpgradeVideo,
  onEnd,
}: {
  peerName: string;
  peerAvatar?: string | null;
  connectedAt: number | null;
  onUpgradeVideo: () => void;
  onEnd: () => void;
}) {
  const participants = useParticipants();
  type LocalParticipantControls = {
    setMicrophoneEnabled?: (enabled: boolean) => Promise<void>;
    setCameraEnabled?: (enabled: boolean) => Promise<void>;
  };
  const local = participants.find((p) => p.isLocal) as
    | (typeof participants[number] & LocalParticipantControls)
    | undefined;
  const remoteCount = participants.filter((p) => !p.isLocal).length;
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [audioOutputName, setAudioOutputName] = useState('Speaker');
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!connectedAt) return;
    const tick = () => setDuration(Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [connectedAt]);

  const toggleMic = async () => {
    try {
      const next = !micEnabled;
      await local?.setMicrophoneEnabled?.(next);
      setMicEnabled(next);
    } catch {
      // ignore
    }
  };

  const turnCameraOn = async () => {
    try {
      await local?.setCameraEnabled?.(true);
      setCameraEnabled(true);
      onUpgradeVideo();
    } catch {
      // ignore
    }
  };

  const selectSpeaker = async () => {
    const selectAudioOutput = (
      navigator as Navigator & {
        mediaDevices?: MediaDevices & {
          selectAudioOutput?: () => Promise<{ label?: string }>;
        };
      }
    )?.mediaDevices?.selectAudioOutput;
    if (typeof selectAudioOutput !== 'function') return;
    try {
      const device = await selectAudioOutput();
      setAudioOutputName(device?.label || 'Speaker');
    } catch {
      // ignore
    }
  };

  return (
    <div className="h-full w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white p-4 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <Avatar src={peerAvatar} alt={peerName} size="xl" className="ring-4 ring-white/20" />
        <h3 className="mt-3 text-lg font-bold truncate max-w-full">{peerName}</h3>
        <p className="text-xs text-slate-300 mt-1">
          Voice call {connectedAt ? `• ${formatDuration(duration)}` : '• Connecting...'}
        </p>
        <p className="text-xs text-slate-400 mt-1">{remoteCount > 0 ? 'Connected' : 'Ringing...'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <button
          onClick={toggleMic}
          className={`h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${
            micEnabled ? 'bg-white/10 hover:bg-white/20' : 'bg-red-500/30 hover:bg-red-500/40'
          }`}
        >
          {micEnabled ? <Mic size={16} /> : <MicOff size={16} />} {micEnabled ? 'Mute' : 'Unmute'}
        </button>
        <button
          onClick={turnCameraOn}
          className={`h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${
            cameraEnabled ? 'bg-purple-500/40' : 'bg-white/10 hover:bg-white/20'
          }`}
        >
          <Video size={16} /> Camera on
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={selectSpeaker}
          className="h-11 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-semibold flex items-center justify-center gap-2"
          title={audioOutputName}
        >
          <Volume2 size={16} /> {audioOutputName}
        </button>
        <button
          onClick={onEnd}
          className="h-11 rounded-xl bg-red-500 hover:bg-red-600 text-sm font-semibold flex items-center justify-center gap-2"
        >
          <PhoneOff size={16} /> End
        </button>
      </div>
    </div>
  );
}

function OneToOneVideoStage({
  peerName,
  peerAvatar,
}: {
  peerName: string;
  peerAvatar?: string | null;
}) {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const remoteTrack = cameraTracks.find((t) => !t.participant.isLocal) ?? null;
  const localTrack = cameraTracks.find((t) => t.participant.isLocal) ?? null;
  const [localMain, setLocalMain] = useState(false);

  const mainTrack = localMain ? localTrack : remoteTrack;
  const pipTrack = localMain ? remoteTrack : localTrack;
  const mainLabel = localMain ? 'You' : (remoteTrack?.participant.name || remoteTrack?.participant.identity || peerName);
  const pipLabel = localMain ? (remoteTrack?.participant.name || remoteTrack?.participant.identity || peerName) : 'You';

  return (
    <div className="relative h-full w-full bg-black overflow-hidden">
      <div className="absolute inset-0">
        {mainTrack ? (
          <ParticipantTile trackRef={mainTrack} className="h-full w-full" />
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-white bg-gradient-to-br from-slate-900 to-slate-700">
            <Avatar src={peerAvatar} alt={peerName} size="xl" className="ring-4 ring-white/20" />
            <p className="mt-3 text-sm font-semibold">Waiting for {peerName}</p>
          </div>
        )}
      </div>

      <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-black/45 border border-white/25 backdrop-blur text-white text-xs font-semibold">
        {mainLabel}
      </div>

      {pipTrack && (
        <button
          type="button"
          onClick={() => setLocalMain((v) => !v)}
          className="absolute z-10 w-24 h-32 sm:w-28 sm:h-36 md:w-32 md:h-44 rounded-2xl overflow-hidden border border-white/60 shadow-2xl bg-black"
          style={{ right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          title="Swap videos"
        >
          <ParticipantTile trackRef={pipTrack} className="h-full w-full" />
          <span className="absolute left-2 bottom-2 px-2 py-0.5 rounded-full bg-black/55 text-white text-[11px] font-semibold border border-white/30">
            {pipLabel}
          </span>
        </button>
      )}
    </div>
  );
}

function VideoCallStage({
  peerName,
  peerAvatar,
}: {
  peerName: string;
  peerAvatar?: string | null;
}) {
  const participants = useParticipants();
  const remoteCount = participants.filter((p) => !p.isLocal).length;
  const isOneToOne = remoteCount <= 1;

  if (isOneToOne) {
    return <OneToOneVideoStage peerName={peerName} peerAvatar={peerAvatar} />;
  }

  // Group calls (3+ total participants) keep the standard conference layout.
  return <VideoConference chatMessageFormatter={formatChatMessageLinks} />;
}

function CallRoomInner({
  onEnd,
  onConnected,
  onCompleted,
  backgrounded,
}: {
  onEnd: () => void;
  onConnected: () => void;
  onCompleted: () => void;
  backgrounded: boolean;
}) {
  const participants = useParticipants();
  const remoteCount = participants.filter((p) => !p.isLocal).length;
  const joinedRef = useRef(false);
  const ringbackRef = useRef<HTMLAudioElement | null>(null);
  const remoteLeftTimerRef = useRef<number | null>(null);

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
        // ignore
      }
    }
  }, [remoteCount]);

  useEffect(() => {
    if (remoteCount > 0) {
      if (remoteLeftTimerRef.current) {
        window.clearTimeout(remoteLeftTimerRef.current);
        remoteLeftTimerRef.current = null;
      }
      if (!joinedRef.current) onConnected();
      joinedRef.current = true;
      return;
    }
    if (joinedRef.current && remoteCount === 0 && !backgrounded) {
      if (remoteLeftTimerRef.current) return;
      // On mobile Safari, participant subscriptions can briefly flap while app is backgrounded.
      remoteLeftTimerRef.current = window.setTimeout(() => {
        remoteLeftTimerRef.current = null;
        onCompleted();
        onEnd();
      }, 15_000);
    }
  }, [remoteCount, onEnd, onConnected, onCompleted, backgrounded]);

  useEffect(() => {
    return () => {
      const el = ringbackRef.current;
      if (el) {
        try {
          el.pause();
          el.currentTime = 0;
        } catch {
          // ignore
        }
      }
      if (remoteLeftTimerRef.current) {
        window.clearTimeout(remoteLeftTimerRef.current);
        remoteLeftTimerRef.current = null;
      }
    };
  }, []);

  return null;
}

export function FloatingCall() {
  const room = useCallStore((s) => s.room);
  const video = useCallStore((s) => s.video);
  const callType = useCallStore((s) => s.callType);
  const peer = useCallStore((s) => s.peer);
  const mode = useCallStore((s) => s.mode);
  const setMode = useCallStore((s) => s.setMode);
  const setMediaMode = useCallStore((s) => s.setMediaMode);
  const end = useCallStore((s) => s.end);

  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<DragPos | null>(null);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [appBackgrounded, setAppBackgrounded] = useState(false);
  const [showReturnBanner, setShowReturnBanner] = useState(false);
  const endedRef = useRef(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const returnBannerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!room) {
      endedRef.current = false;
      return;
    }
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
    api.post('/calls/decline').catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [room, video]);

  const markConnected = useCallback(() => {
    if (connectedAt) return;
    const now = Date.now();
    setConnectedAt(now);
    void trackEvent('call_connected', { room, video, callType });
  }, [connectedAt, room, video, callType]);

  const emitCallEnd = useCallback(
    (reason: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const durationSec = connectedAt ? Math.max(0, Math.round((Date.now() - connectedAt) / 1000)) : 0;
      const payload = { reason, room, video, callType, durationSec, connected: !!connectedAt };
      void trackEvent('call_ended', payload);
      if (connectedAt) {
        void trackEvent('call_completed', payload);
        void trackFirstEvent('first_call_completed', 'first_call_completed', payload);
      }
    },
    [connectedAt, room, video, callType],
  );

  const endCall = useCallback(
    (reason: string) => {
      emitCallEnd(reason);
      end();
    },
    [emitCallEnd, end],
  );

  const onUpgradeVideo = useCallback(() => {
    setMediaMode('video', true);
    setMode('medium');
  }, [setMediaMode, setMode]);

  useEffect(() => {
    const tryEnterPictureInPicture = async () => {
      const root = containerRef.current;
      if (!root) return;
      const videoEl = root.querySelector('video') as HTMLVideoElement | null;
      if (!videoEl) return;
      const docWithPip = document as Document & {
        pictureInPictureEnabled?: boolean;
        pictureInPictureElement?: Element | null;
        exitPictureInPicture?: () => Promise<void>;
      };
      if (!docWithPip.pictureInPictureEnabled || docWithPip.pictureInPictureElement) return;
      if ((videoEl as HTMLVideoElement & { disablePictureInPicture?: boolean }).disablePictureInPicture)
        return;
      try {
        await videoEl.requestPictureInPicture?.();
      } catch {
        // ignore: PiP support differs by iOS/Safari/browser mode.
      }
    };

    const onVisibilityChange = () => {
      const state = document.visibilityState;
      const hidden = state !== 'visible';
      setAppBackgrounded(hidden);
      void trackEvent('call_visibility_change', { room, callType, state, mode });
      if (hidden) {
        setMode('compact');
        setShowReturnBanner(false);
        void tryEnterPictureInPicture();
        return;
      }
      setShowReturnBanner(true);
      if (returnBannerTimerRef.current) {
        window.clearTimeout(returnBannerTimerRef.current);
      }
      returnBannerTimerRef.current = window.setTimeout(() => {
        setShowReturnBanner(false);
        returnBannerTimerRef.current = null;
      }, 8000);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (returnBannerTimerRef.current) {
        window.clearTimeout(returnBannerTimerRef.current);
        returnBannerTimerRef.current = null;
      }
    };
  }, [room, callType, mode, setMode]);

  useEffect(() => {
    if (mode === 'full' && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (mode !== 'full' && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (mode === 'full' && !document.fullscreenElement) {
        setMode('compact');
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [mode, setMode]);

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
    const nx = Math.min(Math.max(8, d.baseX + (e.clientX - d.startX)), window.innerWidth - width - 8);
    const ny = Math.min(Math.max(8, d.baseY + (e.clientY - d.startY)), window.innerHeight - height - 8);
    setPos({ x: nx, y: ny });
  }, []);

  const onDragPointerUp = useCallback(() => {
    dragState.current = null;
  }, []);

  if (!room) return null;

  const isVoiceMode = callType === 'voice';
  const sizeClass = isVoiceMode
    ? 'w-[min(92vw,360px)] h-[min(72vh,390px)] rounded-2xl'
    : mode === 'full'
      ? 'inset-0 w-full h-full rounded-none'
      : mode === 'medium'
        ? 'w-[min(92vw,480px)] h-[min(80vh,620px)] rounded-2xl'
        : 'w-[min(88vw,320px)] h-[min(70vh,440px)] rounded-2xl';

  const positionStyle: React.CSSProperties =
    !isVoiceMode && mode === 'full'
      ? {}
      : pos
        ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
        : { right: 16, bottom: 88 };  // 88px = above the floating mobile pill nav

  const zClass = !isVoiceMode && mode === 'full' ? 'z-[200]' : 'z-[9999]';
  const callLabel = isVoiceMode ? 'Voice call' : 'Video call';

  return (
    <>
      {showReturnBanner && !appBackgrounded && mode === 'compact' && (
        <button
          onClick={() => {
            setMode(isVoiceMode ? 'medium' : 'full');
            setShowReturnBanner(false);
          }}
          className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[210] px-4 py-2 rounded-full bg-black/85 text-white text-sm font-semibold ring-1 ring-white/20 shadow-2xl"
        >
          Return to call
        </button>
      )}

      <div
        ref={containerRef}
        style={positionStyle}
        className={`fixed ${zClass} ${sizeClass} overflow-hidden bg-black shadow-2xl ring-1 ring-white/10 flex flex-col`}
        data-lk-theme="default"
      >
        <div
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          className={`flex items-center gap-1 px-2.5 py-1.5 bg-gray-900/95 text-white select-none ${
            !isVoiceMode && mode === 'full' ? '' : 'cursor-move'
          }`}
        >
          {(isVoiceMode || mode !== 'full') && <GripHorizontal size={18} className="text-gray-400 shrink-0" />}
          <span className="text-xs font-semibold flex-1 truncate">{callLabel}</span>
          <button
            onClick={() => setMode('compact')}
            title="Compact"
            className={`p-1.5 rounded-md hover:bg-white/10 ${mode === 'compact' ? 'text-purple-400' : 'text-gray-300'}`}
          >
            <Minimize2 size={15} />
          </button>
          {!isVoiceMode && (
            <>
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
            </>
          )}
          <button
            onClick={() => endCall('manual_end')}
            title="Leave call"
            className="p-1.5 rounded-md bg-red-500 hover:bg-red-600 text-white ml-1"
          >
            <PhoneOff size={15} />
          </button>
        </div>

        <div className={`flex-1 min-h-0 relative ${!isVoiceMode && mode === 'full' ? 'nxq-call-full' : ''}`}>
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
              <p className="text-gray-400 text-xs">Connecting...</p>
            </div>
          ) : (
            <LiveKitRoom
              token={token}
              serverUrl={serverUrl}
              connect
              video={video}
              audio
              onDisconnected={() => endCall('disconnect')}
              style={{ height: '100%' }}
              className="h-full w-full"
            >
              <CallRoomInner
                onConnected={markConnected}
                onCompleted={() => emitCallEnd('remote_left')}
                onEnd={() => endCall('remote_left')}
                backgrounded={appBackgrounded}
              />
              {isVoiceMode ? (
                <VoiceCallPanel
                  peerName={peer?.displayName ?? peer?.username ?? 'Voice call'}
                  peerAvatar={peer?.avatarUrl}
                  connectedAt={connectedAt}
                  onUpgradeVideo={onUpgradeVideo}
                  onEnd={() => endCall('manual_end')}
                />
              ) : (
                <VideoCallStage
                  peerName={peer?.displayName ?? peer?.username ?? 'Participant'}
                  peerAvatar={peer?.avatarUrl}
                />
              )}
              <RoomAudioRenderer />
            </LiveKitRoom>
          )}
        </div>
      </div>
    </>
  );
}
