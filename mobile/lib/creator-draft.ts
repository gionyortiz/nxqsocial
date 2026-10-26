import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export type CreatorDraft = {
  id: string; uri: string; type: 'image' | 'video'; mime: string;
  caption: string; visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  width: number | null; height: number | null; isStory: boolean;
  scale: number; offsetX: number; offsetY: number; savedAt: string;
};
const key = (userId: string) => `nxq.creator-draft.v1.${encodeURIComponent(userId)}`;
const folder = (userId: string) => new Directory(Paths.document, 'nxq-drafts', encodeURIComponent(userId));
function ownedFile(userId: string, draft: CreatorDraft): File | null {
  // Delete only files this feature owns, never a library original or arbitrary URI.
  if (!/^[a-z0-9-]+$/.test(draft.id)) return null;
  const file = new File(folder(userId), `${draft.id}.${draft.type === 'video' ? 'mp4' : 'jpg'}`);
  return file.uri === draft.uri ? file : null;
}
export async function readCreatorDraft(userId: string): Promise<CreatorDraft | null> {
  const raw = await AsyncStorage.getItem(key(userId));
  if (!raw) return null;
  let draft: CreatorDraft;
  try { draft = JSON.parse(raw); } catch { throw new Error('The saved draft could not be read.'); }
  if (!draft || !['image', 'video'].includes(draft.type) || typeof draft.id !== 'string' ||
      typeof draft.caption !== 'string' || !['PUBLIC', 'FOLLOWERS', 'PRIVATE'].includes(draft.visibility) ||
      !Number.isFinite(draft.scale) || draft.scale < 1 || draft.scale > 3 ||
      !Number.isFinite(draft.offsetX) || !Number.isFinite(draft.offsetY) || !/^[a-z0-9-]+$/.test(draft.id)) {
    throw new Error('The saved draft media is no longer on this phone.');
  }
  // iOS can move the app container during an update; reconstruct the owned path.
  draft.uri = new File(folder(userId), `${draft.id}.${draft.type === 'video' ? 'mp4' : 'jpg'}`).uri;
  if (!ownedFile(userId, draft)?.exists) throw new Error('The saved draft media is no longer on this phone.');
  return draft;
}
export async function saveCreatorDraft(userId: string, draft: Omit<CreatorDraft, 'id' | 'savedAt'>): Promise<CreatorDraft> {
  const previous = await readCreatorDraft(userId).catch(() => null);
  const directory = folder(userId); directory.create({ intermediates: true, idempotent: true });
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const file = new File(directory, `${id}.${draft.type === 'video' ? 'mp4' : 'jpg'}`);
  try {
    new File(draft.uri).copy(file);
    if (!file.exists || !file.size) throw new Error('Not enough storage to save this draft.');
    const saved = { ...draft, uri: file.uri, id, savedAt: new Date().toISOString() };
    // Commit only after the media copy succeeds. A failed save keeps the old draft.
    await AsyncStorage.setItem(key(userId), JSON.stringify(saved));
    if (previous) { try { ownedFile(userId, previous)?.delete(); } catch {} }
    return saved;
  } catch (error) { try { if (file.exists) file.delete(); } catch {} throw error; }
}
export async function discardCreatorDraft(userId: string, expectedId?: string) {
  const draft = await readCreatorDraft(userId).catch(() => null);
  if (expectedId && draft?.id !== expectedId) return;
  await AsyncStorage.removeItem(key(userId));
  if (draft) { try { ownedFile(userId, draft)?.delete(); } catch {} }
}
