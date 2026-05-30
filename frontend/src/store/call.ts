import { create } from 'zustand';

export type CallMode = 'compact' | 'medium' | 'full';

interface CallState {
  /** Active room id, or null when not in a call. */
  room: string | null;
  /** Whether the call started with video enabled. */
  video: boolean;
  /** Window display mode. */
  mode: CallMode;
  /** Begin (or switch to) a call in the given room. */
  start: (room: string, video: boolean) => void;
  /** Change the floating-window display mode. */
  setMode: (mode: CallMode) => void;
  /** End the current call and tear down the floating window. */
  end: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  room: null,
  video: true,
  mode: 'compact',
  start: (room, video) => set({ room, video, mode: 'compact' }),
  setMode: (mode) => set({ mode }),
  end: () => set({ room: null }),
}));
