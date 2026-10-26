import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export const VIDEO_LOOKS = ['original', 'golden', 'cool', 'vivid', 'cinema', 'mono'] as const;
export type VideoEffects = {
  look: typeof VIDEO_LOOKS[number];
  intensity: number;
  smooth: number;
  glow: number;
};
export type EditedVideo = {
  canceled: false;
  uri: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  effects: VideoEffects;
};
type Result = EditedVideo | { canceled: true };
type NativeEditor = {
  editAsync(uri: string, effects: VideoEffects): Promise<Result>;
  removeAsync(uri: string): Promise<void>;
};
// Optional keeps Android, web and older installed binaries usable.
const nativeEditor = Platform.OS === 'ios'
  ? requireOptionalNativeModule<NativeEditor>('NXQVideoEffects')
  : null;
export const videoEffectsAvailable = Boolean(nativeEditor);
export const DEFAULT_VIDEO_EFFECTS: VideoEffects = { look: 'original', intensity: 0.7, smooth: 0, glow: 0 };
export function normalizeVideoEffects(input?: Partial<VideoEffects>): VideoEffects {
  const unit = (n: unknown, fallback: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
  return {
    look: VIDEO_LOOKS.includes(input?.look as VideoEffects['look']) ? input!.look! : 'original',
    intensity: unit(input?.intensity, 0.7), smooth: unit(input?.smooth, 0), glow: unit(input?.glow, 0),
  };
}
export async function editVideo(uri: string, effects?: VideoEffects): Promise<Result> {
  if (!nativeEditor) throw new Error('Video effects need the latest NXQ iPhone app.');
  if (!uri.startsWith('file://')) throw new Error('Choose a video downloaded to this iPhone first.');
  return nativeEditor.editAsync(uri, normalizeVideoEffects(effects));
}
// The native side additionally verifies ownership before deleting any file.
export async function removeEditedVideo(uri?: string | null): Promise<void> {
  if (!uri || !nativeEditor) return;
  await nativeEditor.removeAsync(uri).catch(() => undefined);
}
