import AsyncStorage from '@react-native-async-storage/async-storage';
import { readCreatorDraft, saveCreatorDraft, discardCreatorDraft } from '../lib/creator-draft';

const mockFiles = new Map<string, number>();
let mockCopyFails = false;
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-file-system', () => {
  const uri = (parts: any[]) => parts.map(p => typeof p === 'string' ? p : p.uri).join('/');
  return {
    Paths: { document: 'file:///documents' },
    Directory: class { uri: string; constructor(...parts: any[]) { this.uri = uri(parts); } create() {} },
    File: class {
      uri: string; constructor(...parts: any[]) { this.uri = uri(parts); }
      get exists() { return mockFiles.has(this.uri); } get size() { return mockFiles.get(this.uri) || 0; }
      copy(target: { uri: string }) { if (mockCopyFails) throw new Error('Storage full'); mockFiles.set(target.uri, mockFiles.get(this.uri) || 0); }
      delete() { mockFiles.delete(this.uri); }
    },
  };
});
const source = { uri: 'file:///library/original.mp4', type: 'video' as const, mime: 'video/mp4', caption: 'Family time', visibility: 'FOLLOWERS' as const, width: 1080, height: 1920, isStory: false, scale: 1.3, offsetX: 0.2, offsetY: -0.1 };
beforeEach(async () => { await AsyncStorage.clear(); mockFiles.clear(); mockFiles.set(source.uri, 1234); mockCopyFails = false; });

test('draft survives a new read with its own media copy and stays isolated by account', async () => {
  const saved = await saveCreatorDraft('account-a', source);
  expect(saved.uri).not.toBe(source.uri); expect(mockFiles.has(source.uri)).toBe(true);
  expect(await readCreatorDraft('account-a')).toEqual(saved);
  expect(await readCreatorDraft('account-b')).toBeNull();
  await discardCreatorDraft('account-a', saved.id);
  expect(await readCreatorDraft('account-a')).toBeNull(); expect(mockFiles.has(source.uri)).toBe(true);
});
test('failed media copy or manifest write leaves the previous draft usable', async () => {
  const first = await saveCreatorDraft('account-a', source);
  mockCopyFails = true;
  await expect(saveCreatorDraft('account-a', { ...source, caption: 'Replacement' })).rejects.toThrow('Storage full');
  expect(await readCreatorDraft('account-a')).toEqual(first);
  mockCopyFails = false;
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
  await expect(saveCreatorDraft('account-a', source)).rejects.toThrow('disk full');
  expect(await readCreatorDraft('account-a')).toEqual(first);
  expect(mockFiles.size).toBe(2);
});
test('replacing a draft cleans only its old copy, and an older publish cannot discard the new draft', async () => {
  const first = await saveCreatorDraft('account-a', source);
  const second = await saveCreatorDraft('account-a', { ...source, caption: 'New draft' });
  await discardCreatorDraft('account-a', first.id);
  expect(await readCreatorDraft('account-a')).toEqual(second);
  expect(mockFiles.has(first.uri)).toBe(false); expect(mockFiles.has(second.uri)).toBe(true);
});
test('untrusted draft metadata never deletes an original or another account file', async () => {
  await AsyncStorage.setItem('nxq.creator-draft.v1.account-a', JSON.stringify({ ...source, id: 'malicious', savedAt: '2026-10-20' }));
  await expect(readCreatorDraft('account-a')).rejects.toThrow('no longer');
  await discardCreatorDraft('account-a'); expect(mockFiles.has(source.uri)).toBe(true);
});
