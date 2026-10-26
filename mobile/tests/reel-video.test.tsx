import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ReelVideo } from '../components/ReelVideo';
import { pauseAllMedia } from '../lib/mediaPlayback';

const mockListeners = new Map<string, (event?: any) => void>();
const mockRemoved = jest.fn();
const mockPlayer = {
  loop: true, currentTime: 0, status: 'readyToPlay', play: jest.fn(), pause: jest.fn(),
  addListener: jest.fn((event: string, callback: () => void) => {
    mockListeners.set(event, callback);
    return { remove: () => { mockListeners.delete(event); mockRemoved(); } };
  }),
};
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
jest.mock('expo-video', () => ({
  VideoView: 'MockVideo',
  useVideoPlayer: (_source: unknown, setup: Function) => {
    require('react').useEffect(() => { setup(mockPlayer); }, []);
    return mockPlayer;
  },
}));
beforeEach(() => { mockListeners.clear(); mockPlayer.currentTime = 0; });
const finish = () => act(() => { mockListeners.get('playToEnd')?.(); });

test('auto-scroll disables looping and advances only once for duplicate completion events', () => {
  const onFinish = jest.fn();
  render(<ReelVideo uri="fixture.mp4" focused autoScroll onFinish={onFinish} />);
  expect(mockPlayer.loop).toBe(false);
  finish(); finish();
  expect(onFinish).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Replay video')).toBeTruthy();
});

test('switch off retains looping and never advances, including after toggling', () => {
  const onFinish = jest.fn();
  const view = render(<ReelVideo uri="fixture.mp4" focused autoScroll={false} onFinish={onFinish} />);
  expect(mockPlayer.loop).toBe(true); finish(); expect(onFinish).not.toHaveBeenCalled();
  view.rerender(<ReelVideo uri="fixture.mp4" focused autoScroll onFinish={onFinish} />);
  finish(); expect(onFinish).toHaveBeenCalledTimes(1);
});

test('offscreen and manually paused videos cannot advance', () => {
  const onFinish = jest.fn();
  const view = render(<ReelVideo uri="fixture.mp4" focused={false} autoScroll onFinish={onFinish} />);
  finish(); expect(onFinish).not.toHaveBeenCalled();
  view.rerender(<ReelVideo uri="fixture.mp4" focused autoScroll onFinish={onFinish} />);
  fireEvent.press(screen.getByLabelText('Pause video'));
  finish(); expect(onFinish).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Play video'));
  finish(); expect(onFinish).toHaveBeenCalledTimes(1);
});

test('a share, comment or call interruption pauses playback until resumed or refocused', () => {
  const onFinish = jest.fn();
  const view = render(<ReelVideo uri="fixture.mp4" focused autoScroll onFinish={onFinish} />);
  act(() => pauseAllMedia());
  mockPlayer.play.mockClear();
  act(() => mockListeners.get('statusChange')?.({ status: 'readyToPlay' }));
  finish();
  expect(onFinish).not.toHaveBeenCalled(); expect(mockPlayer.play).not.toHaveBeenCalled();
  view.rerender(<ReelVideo uri="fixture.mp4" focused={false} autoScroll onFinish={onFinish} />);
  view.rerender(<ReelVideo uri="fixture.mp4" focused autoScroll onFinish={onFinish} />);
  expect(mockPlayer.play).toHaveBeenCalled(); finish(); expect(onFinish).toHaveBeenCalledTimes(1);
});

test('final video offers replay and can complete again after the user restarts it', () => {
  const onFinish = jest.fn();
  const view = render(<ReelVideo uri="fixture.mp4" focused autoScroll onFinish={onFinish} />);
  finish(); mockPlayer.currentTime = 42;
  fireEvent.press(screen.getByLabelText('Replay video'));
  expect(mockPlayer.currentTime).toBe(0);
  finish(); expect(onFinish).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(mockListeners.size).toBe(0);
  mockPlayer.pause.mockClear(); act(() => pauseAllMedia());
  expect(mockPlayer.pause).not.toHaveBeenCalled();
});
