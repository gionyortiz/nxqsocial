import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiRequest } from '../lib/api';
import ReelsScreen from '../app/(tabs)/reels';

const mockScrollToIndex = jest.fn();
let mockListProps: any;
let mockAppStateListener: (state: AppStateStatus) => void;
jest.mock('react-native/Libraries/Lists/FlatList', () => {
  const React = require('react');
  const View = require('react-native').View;
  return { __esModule: true, default: React.forwardRef((props: any, ref: any) => {
      mockListProps = props;
      React.useImperativeHandle(ref, () => ({ scrollToIndex: mockScrollToIndex }));
      return React.createElement(View, null, props.data.map((item: any) =>
        React.createElement(View, { key: item.id }, props.renderItem({ item }))));
    }) };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 'fixture', user: { id: 'viewer' } }) }));
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn(), resolveMediaUrl: (url: string) => url }));
jest.mock('@/components/ReelVideo', () => ({ ReelVideo: 'MockReelVideo' }));
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
const posts = ['one', 'two', 'three'].map((id) => ({
  id, type: 'REEL', media: [{ url: `${id}.mp4`, mimeType: 'video/mp4' }],
  author: { id: 'creator', username: 'creator' }, _count: { likes: 0, comments: 0 },
}));
beforeEach(() => {
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    mockAppStateListener = listener; return { remove: jest.fn() };
  });
  jest.mocked(apiRequest).mockResolvedValue({ data: posts });
  jest.mocked(AsyncStorage.getItem).mockReset().mockResolvedValue(null);
  jest.mocked(AsyncStorage.setItem).mockResolvedValue();
});
async function start() {
  render(<ReelsScreen />);
  await waitFor(() => expect(screen.UNSAFE_getAllByType('MockReelVideo' as any).length).toBe(3));
}
function videos() { return screen.UNSAFE_getAllByType('MockReelVideo' as any); }
function end(index: number) { act(() => videos()[index].props.onFinish()); }
function visible(index: number) {
  act(() => mockListProps.onViewableItemsChanged({ viewableItems: [{ item: posts[index] }] }));
}

test('advances one item, waits for scroll completion, and never scrolls past the final reel', async () => {
  await start();
  end(0); end(0);
  expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
  expect(mockScrollToIndex).toHaveBeenLastCalledWith({ index: 1, animated: true });
  visible(1); act(() => mockListProps.onMomentumScrollEnd());
  expect(videos()[1].props.focused).toBe(true);
  end(0); expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
  end(1); expect(mockScrollToIndex).toHaveBeenLastCalledWith({ index: 2, animated: true });
  visible(2); act(() => mockListProps.onMomentumScrollEnd());
  end(2); expect(mockScrollToIndex).toHaveBeenCalledTimes(2);
});

test('switch setting is restored and changes persist without allowing off-state auto-scroll', async () => {
  jest.mocked(AsyncStorage.getItem).mockResolvedValue('false');
  await start();
  expect(screen.getAllByRole('switch')[0].props.accessibilityState.checked).toBe(false);
  end(0); expect(mockScrollToIndex).not.toHaveBeenCalled();
  fireEvent.press(screen.getAllByRole('switch')[0]);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('nxq.reels.autoScroll.v1', 'true');
  end(0); expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
});

test('manual swipes and backgrounding suppress late completion callbacks', async () => {
  await start();
  act(() => mockListProps.onScrollBeginDrag()); end(0);
  expect(mockScrollToIndex).not.toHaveBeenCalled();
  act(() => mockListProps.onMomentumScrollEnd());
  act(() => { AppState.currentState = 'background'; mockAppStateListener('background'); });
  expect(videos()[0].props.focused).toBe(false); end(0);
  expect(mockScrollToIndex).not.toHaveBeenCalled();
  act(() => { AppState.currentState = 'active'; mockAppStateListener('active'); });
  end(0); expect(mockScrollToIndex).toHaveBeenCalledTimes(1);
});

test('fallback unlocks playback if native momentum-end is omitted', async () => {
  await start(); jest.useFakeTimers();
  end(0); visible(1);
  act(() => jest.advanceTimersByTime(950));
  expect(videos()[1].props.focused).toBe(true);
  end(1); expect(mockScrollToIndex).toHaveBeenCalledTimes(2);
});

test('late preference reads do not undo a switch tap', async () => {
  let resolve!: (value: string) => void;
  jest.mocked(AsyncStorage.getItem).mockImplementation(() => new Promise((done) => { resolve = done; }));
  await start();
  fireEvent.press(screen.getAllByRole('switch')[0]);
  await act(async () => resolve('true'));
  expect(screen.getAllByRole('switch')[0].props.accessibilityState.checked).toBe(false);
});

test('Auto-scroll is visible and operable when no reels have been posted', async () => {
  jest.mocked(apiRequest).mockResolvedValue({ data: [] });
  render(<ReelsScreen />);
  await screen.findByText('Your next favorite moment');
  expect(screen.getAllByRole('switch')).toHaveLength(1);
  fireEvent.press(screen.getByRole('switch'));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('nxq.reels.autoScroll.v1', 'false');
});
