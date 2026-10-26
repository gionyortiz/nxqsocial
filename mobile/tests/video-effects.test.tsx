import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { VideoEffectsButton } from '../components/VideoEffectsButton';
import { editVideo, EditedVideo, normalizeVideoEffects, removeEditedVideo } from '../modules/nxq-video-effects';
import { requireOptionalNativeModule } from 'expo-modules-core';

jest.mock('expo-modules-core', () => {
  const native = { editAsync: jest.fn(), removeAsync: jest.fn(async () => undefined) };
  return { requireOptionalNativeModule: () => native };
});
const mockNative = requireOptionalNativeModule('NXQVideoEffects') as unknown as { editAsync: jest.Mock; removeAsync: jest.Mock };
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
const edited: EditedVideo = { canceled: false, uri: 'file:///cache/NXQVideoEffects/nxq-effects-test.mp4', width: 720, height: 1280, duration: 10000, size: 10000,
  effects: { look: 'golden', intensity: 0.7, smooth: 0.25, glow: 0.2 } };
beforeEach(() => { mockNative.editAsync.mockReset(); mockNative.removeAsync.mockClear(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });

test('effect parameters are finite and bounded; unknown looks stay original', () => {
  expect(normalizeVideoEffects({ look: 'invalid' as any, intensity: Infinity, smooth: -1, glow: 4 })).toEqual({ look: 'original', intensity: 0.7, smooth: 0, glow: 1 });
  expect(normalizeVideoEffects({ smooth: NaN }).smooth).toBe(0);
});
test('editing rejects remote video before invoking the renderer', async () => {
  await expect(editVideo('https://example.com/video.mp4')).rejects.toThrow('downloaded to this iPhone');
  expect(mockNative.editAsync).not.toHaveBeenCalled();
});
test('reopening edits uses the original file and saved settings, not the last encoded output', async () => {
  mockNative.editAsync.mockResolvedValue(edited);
  const change = jest.fn(); const busy = jest.fn();
  render(<VideoEffectsButton uri="file:///original.mov" value={edited} disabled={false} onChange={change} onBusy={busy} />);
  await act(async () => fireEvent.press(screen.getByLabelText('Edit video filters and beauty')));
  expect(mockNative.editAsync).toHaveBeenCalledWith('file:///original.mov', edited.effects);
  expect(change).toHaveBeenCalledWith(edited);
  expect(busy.mock.calls).toEqual([[true], [false]]);
});
test('cancel keeps the previous edit and rapid taps only open one editor', async () => {
  let resolve!: (result: any) => void;
  mockNative.editAsync.mockImplementation(() => new Promise(done => { resolve = done; }));
  const change = jest.fn(); const busy = jest.fn();
  render(<VideoEffectsButton uri="file:///original.mov" value={edited} disabled={false} onChange={change} onBusy={busy} />);
  fireEvent.press(screen.getByLabelText('Edit video filters and beauty'));
  fireEvent.press(screen.getByLabelText('Edit video filters and beauty'));
  expect(mockNative.editAsync).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ canceled: true }));
  expect(change).not.toHaveBeenCalled(); expect(busy).toHaveBeenLastCalledWith(false);
});
test('a failed export leaves the previous edit and releases publishing', async () => {
  mockNative.editAsync.mockRejectedValue(new Error('Not enough space'));
  const change = jest.fn(); const busy = jest.fn();
  render(<VideoEffectsButton uri="file:///original.mov" value={edited} disabled={false} onChange={change} onBusy={busy} />);
  await act(async () => fireEvent.press(screen.getByLabelText('Edit video filters and beauty')));
  expect(change).not.toHaveBeenCalled(); expect(busy).toHaveBeenLastCalledWith(false);
  expect(Alert.alert).toHaveBeenCalledWith('Video effects', 'Not enough space');
});
test('reset returns to the original without modifying the source file', async () => {
  const change = jest.fn();
  render(<VideoEffectsButton uri="file:///original.mov" value={edited} disabled={false} onChange={change} onBusy={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Remove video effects'));
  expect(change).toHaveBeenCalledWith(null); expect(mockNative.removeAsync).not.toHaveBeenCalled();
});
test('a native reset returning the original removes the selected effect', async () => {
  mockNative.editAsync.mockResolvedValue({ ...edited, uri: 'file:///original.mov' });
  const change = jest.fn();
  render(<VideoEffectsButton uri="file:///original.mov" value={edited} disabled={false} onChange={change} onBusy={jest.fn()} />);
  await act(async () => fireEvent.press(screen.getByLabelText('Edit video filters and beauty')));
  expect(change).toHaveBeenCalledWith(null);
});
test('unmounted editor discards only its returned temporary output', async () => {
  let resolve!: (result: any) => void;
  mockNative.editAsync.mockImplementation(() => new Promise(done => { resolve = done; }));
  const change = jest.fn();
  const view = render(<VideoEffectsButton uri="file:///original.mov" value={null} disabled={false} onChange={change} onBusy={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Edit video filters and beauty')); view.unmount();
  await act(async () => resolve(edited));
  expect(change).not.toHaveBeenCalled(); expect(mockNative.removeAsync).toHaveBeenCalledWith(edited.uri);
});
test('disabled controls cannot start another edit or remove the selected result', () => {
  const change = jest.fn();
  render(<VideoEffectsButton uri="file:///original.mov" value={edited} disabled onChange={change} onBusy={jest.fn()} />);
  fireEvent.press(screen.getByLabelText('Edit video filters and beauty')); fireEvent.press(screen.getByLabelText('Remove video effects'));
  expect(mockNative.editAsync).not.toHaveBeenCalled(); expect(change).not.toHaveBeenCalled();
});
test('missing cleanup file does not turn a successful publish into an error', async () => {
  mockNative.removeAsync.mockRejectedValueOnce(new Error('already removed'));
  await expect(removeEditedVideo(edited.uri)).resolves.toBeUndefined();
});
