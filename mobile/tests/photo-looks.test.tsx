import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { PhotoLooks } from '../components/PhotoLooks';
import { PHOTO_LOOKS, PHOTO_LOOK_PROCESSOR, applyPhotoLook, photoLookHtml } from '../lib/photoLooks';
import * as ImageManipulator from 'expo-image-manipulator';

const mockWrite = jest.fn(); const mockDelete = jest.fn();
jest.mock('react-native-webview', () => ({ WebView: 'MockWebView' }));
jest.mock('expo-file-system', () => ({ Paths: { cache: 'file:///cache' }, File: class { uri = 'file:///filtered.jpg'; exists = true; write = mockWrite; delete = mockDelete; } }));
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(async () => ({ uri: 'file:///small.jpg', base64: 'ZmFrZQ==' })), SaveFormat: { JPEG: 'jpeg' } }));

test.each(PHOTO_LOOKS)('$label uses the same pixel math on web and native, without changing alpha', ({ id }) => {
  const source = new Uint8ClampedArray([10, 80, 240, 255, 120, 60, 20, 128, 0, 255, 20, 0, 60, 30, 220, 255]);
  const web = new Uint8ClampedArray(source), native = new Uint8ClampedArray(source);
  applyPhotoLook(web, 2, 2, id);
  // The literal is executed by WKWebView, not Hermes Function.toString().
  const nativeTransform = new Function(`return (${PHOTO_LOOK_PROCESSOR})`)();
  nativeTransform(native, 2, 2, id);
  expect(native).toEqual(web);
  for (let i = 3; i < source.length; i += 4) expect(native[i]).toBe(source[i]);
  if (id !== 'original') expect(native).not.toEqual(source);
});

test('processor refuses non-image script injection and blocks external network resources', () => {
  expect(() => photoLookHtml('</script>', 'warm')).toThrow();
  const html = photoLookHtml('ZmFrZQ==', 'glow');
  expect(html).toContain("default-src 'none'"); expect(html).toContain("img-src data:");
  expect(html).not.toContain('[native code]');
});

test('a saved filter produces a bounded JPEG file and switching Original restores the source', async () => {
  const change = jest.fn(), busy = jest.fn();
  const view = render(<PhotoLooks uri="file:///source.jpg" width={4000} height={3000} disabled={false} onChange={change} onBusy={busy} />);
  fireEvent.press(screen.getByLabelText('Photo look: Soft Glow'));
  await waitFor(() => expect(screen.UNSAFE_getByType('MockWebView' as any)).toBeTruthy());
  expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith('file:///source.jpg', [{ resize: { width: 1280 } }], expect.objectContaining({ base64: true }));
  act(() => screen.UNSAFE_getByType('MockWebView' as any).props.onMessage({ nativeEvent: { data: JSON.stringify({ image: 'data:image/jpeg;base64,ZmFrZQ==', width: 1280, height: 960 }) } }));
  expect(mockWrite).toHaveBeenCalledWith('ZmFrZQ==', { encoding: 'base64' });
  expect(change).toHaveBeenLastCalledWith({ uri: 'file:///filtered.jpg', width: 1280, height: 960 });
  expect(busy).toHaveBeenLastCalledWith(false);
  fireEvent.press(screen.getByLabelText('Photo look: Original')); expect(change).toHaveBeenLastCalledWith(null);
  view.unmount(); expect(mockDelete).toHaveBeenCalled();
});

test('timeout releases publishing and rejects late filter results', async () => {
  jest.useFakeTimers(); const change = jest.fn(), busy = jest.fn();
  render(<PhotoLooks uri="file:///source.jpg" width={100} height={100} disabled={false} onChange={change} onBusy={busy} />);
  await act(async () => fireEvent.press(screen.getByLabelText('Photo look: Mono')));
  const receive = screen.UNSAFE_getByType('MockWebView' as any).props.onMessage;
  act(() => jest.advanceTimersByTime(20001));
  expect(busy).toHaveBeenLastCalledWith(false); expect(change).toHaveBeenLastCalledWith(null);
  act(() => receive({ nativeEvent: { data: JSON.stringify({ image: 'data:image/jpeg;base64,ZmFrZQ==', width: 100, height: 100 }) } }));
  expect(mockWrite).not.toHaveBeenCalled();
});
