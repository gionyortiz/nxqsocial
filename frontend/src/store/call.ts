import { create } from 'zustand';

export type CallMode = 'compact' | 'medium' | 'full';
export type CallType = 'voice' | 'video';

export interface CallPeer {
  username: string;
  displayName: string;
  avatarUrl?: string | null;
}

interface StartCallOptions {
  video?: boolean;
  callType?: CallType;
  peer?: CallPeer | null;
}

interface CallState {
  /** Active room id, or null when not in a call. */
  room: string | null;
  /** Whether the call started with video enabled. */
  video: boolean;
  /** Voice or video call mode. */
  callType: CallType;
  /** Primary peer shown in compact voice card. */
  peer: CallPeer | null;
  /** Window display mode. */
  mode: CallMode;
  /** Begin (or switch to) a call in the given room. */
  start: (room: string, options?: StartCallOptions) => void;
  /** Change the floating-window display mode. */
  setMode: (mode: CallMode) => void;
  /** Update call media mode while staying in the same room. */
  setMediaMode: (callType: CallType, video: boolean) => void;
  /** End the current call and tear down the floating window. */
  end: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  room: null,
  video: true,
  callType: 'video',
  peer: null,
  mode: 'compact',
  start: (room, options) => {
    const video = options?.video ?? true;
    const callType = options?.callType ?? (video ? 'video' : 'voice');
    set({ room, video, callType, peer: options?.peer ?? null, mode: 'compact' });
  },
  setMode: (mode) => set({ mode }),
  setMediaMode: (callType, video) => set({ callType, video }),
  end: () => set({ room: null, peer: null }),
}));
