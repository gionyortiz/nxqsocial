import React from 'react';
import { AppState } from 'react-native';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import { useFocusedRefresh } from '../lib/useFocusedRefresh';
import { mergeMessages } from '../lib/message-history';
import ThreadScreen from '../app/messages/[threadId]';
import MessagesScreen from '../app/(tabs)/messages';
import { apiRequest } from '../lib/api';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 'fixture', user: { id: 'me', username: 'me' } }) }));
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn(), resolveMediaUrl: (url: string) => url }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]), useRouter: () => ({ push: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({ threadId: 'family', username: 'sister' }) }));

const msg = (id: string, content = id) => ({ id, content, createdAt: `2026-10-20T12:00:${id.padStart(2, '0')}Z`, sender: { id: 'sister' } });
beforeEach(() => { jest.useFakeTimers(); jest.mocked(apiRequest).mockReset(); });

test('refresh pauses in background, ignores stale results and stops after unmount', async () => {
  let change!: (state: any) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => { change = listener; return { remove: jest.fn() }; });
  let finish!: () => void;
  const applied = jest.fn();
  const task = jest.fn(async (current: () => boolean) => { await new Promise<void>(resolve => { finish = resolve; }); if (current()) applied(); });
  const hook = renderHook(() => useFocusedRefresh(task, 8000));
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(24000); });
  expect(task).toHaveBeenCalledTimes(1);
  act(() => change('background')); await act(async () => finish());
  expect(applied).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(16000); });
  expect(task).toHaveBeenCalledTimes(1);
  act(() => change('active')); expect(task).toHaveBeenCalledTimes(2);
  hook.unmount(); await act(async () => finish());
  expect(applied).not.toHaveBeenCalled();
});

test('message history deduplicates overlapping refresh/send pages without losing older messages', () => {
  const merged = mergeMessages([msg('1'), msg('2'), msg('4')], [msg('2'), msg('3'), msg('4')]);
  expect(merged.map(row => row.id)).toEqual(['1', '2', '3', '4']);
});

test('an open conversation receives new messages and retains history through an outage', async () => {
  let rows = [msg('1', 'Hello family')]; let offline = false;
  jest.mocked(apiRequest).mockImplementation(async path => {
    if (String(path).endsWith('/read')) return {};
    if (offline) throw new Error('offline');
    return { data: rows, nextCursor: null };
  });
  render(<ThreadScreen />); await act(async () => {});
  expect(screen.getByText('Hello family')).toBeTruthy();
  rows = [...rows, msg('2', 'See you soon')];
  await act(async () => { jest.advanceTimersByTime(8000); });
  expect(screen.getByText('See you soon')).toBeTruthy();
  offline = true;
  await act(async () => { jest.advanceTimersByTime(8000); });
  expect(screen.getByText('Hello family')).toBeTruthy();
  expect(screen.getByLabelText('Retry loading messages')).toBeTruthy();
});

test('earlier messages merge without duplicate rows or erasing a newer page', async () => {
  jest.mocked(apiRequest).mockImplementation(async path => {
    if (String(path).includes('?cursor=')) return { data: [msg('1', 'Earlier'), msg('2', 'Recent')], nextCursor: null };
    return { data: [msg('2', 'Recent')], nextCursor: '2' };
  });
  render(<ThreadScreen />); await act(async () => {});
  await act(async () => { fireEvent.press(screen.getByText('Load earlier messages')); });
  expect(screen.getByText('Earlier')).toBeTruthy(); expect(screen.getAllByText('Recent')).toHaveLength(1);
  await act(async () => { jest.advanceTimersByTime(8000); });
  expect(screen.queryByText('Load earlier messages')).toBeNull();
});

test('inbox unread filter is functional and failed refresh preserves conversations', async () => {
  const data = [
    { id: 'one', participant: { username: 'sister', displayName: 'Sister' }, unreadCount: 1 },
    { id: 'two', participant: { username: 'brother', displayName: 'Brother' }, unreadCount: 0 },
  ];
  jest.mocked(apiRequest).mockResolvedValue({ data });
  render(<MessagesScreen />); await act(async () => {});
  fireEvent.press(screen.getByLabelText('Unread conversations'));
  expect(screen.getByText('Sister')).toBeTruthy(); expect(screen.queryByText('Brother')).toBeNull();
  fireEvent.press(screen.getByLabelText('All conversations')); expect(screen.getByText('Brother')).toBeTruthy();
  jest.mocked(apiRequest).mockRejectedValue(new Error('offline'));
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(screen.getByText('Brother')).toBeTruthy();
  expect(screen.getByText('Could not refresh messages. Pull down to retry.')).toBeTruthy();
});
