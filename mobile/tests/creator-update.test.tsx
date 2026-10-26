import React from 'react';
import { Keyboard } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Updates from 'expo-updates';
import { apiRequest } from '../lib/api';
import { CommentComposer } from '../components/CommentComposer';
import AppUpdatesScreen from '../app/app-updates';
import ThreadScreen from '../app/messages/[threadId]';

jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
jest.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 'fixture', user: { id: 'me' } }) }));
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn(), resolveMediaUrl: (url: string) => url }));
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]), useRouter: () => ({ push: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({ threadId: 'fixture-thread', username: 'fixture-friend' }) }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.13' }, platform: { ios: { buildNumber: '98' } } } }));
jest.mock('expo-updates', () => ({ isEnabled: true, updateId: 'fixture-update', runtimeVersion: '1.0.13', channel: 'production', useUpdates: () => ({ isUpdatePending: false }), checkForUpdateAsync: jest.fn(), fetchUpdateAsync: jest.fn(), reloadAsync: jest.fn() }));
const post = { id: 'post-fixture', author: { username: 'friend' } } as any;
beforeEach(() => jest.mocked(apiRequest).mockResolvedValue({ data: [] }));

test('comment Done hides the keyboard without discarding the draft, and Cancel closes the sheet', () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss'); const close = jest.fn();
  render(<CommentComposer post={post} token="fixture" onClose={close} onPosted={jest.fn()} />);
  const input = screen.getByLabelText('Comment');
  fireEvent.changeText(input, 'A good moment'); fireEvent(input, 'focus');
  fireEvent.press(screen.getByLabelText('Done editing. Hide keyboard'));
  expect(dismiss).toHaveBeenCalled(); expect(input.props.value).toBe('A good moment');
  fireEvent.press(screen.getByLabelText('Cancel comment')); expect(close).toHaveBeenCalledTimes(1);
});

test('failed comments keep the draft and repeated Post taps send once', async () => {
  let reject!: (error: Error) => void;
  jest.mocked(apiRequest).mockImplementation((_path, options) => options?.method === 'POST' ? new Promise((_resolve, fail) => { reject = fail; }) : Promise.resolve({ data: [] }));
  const posted = jest.fn(); const close = jest.fn();
  render(<CommentComposer post={post} token="fixture" onClose={close} onPosted={posted} />);
  fireEvent.changeText(screen.getByLabelText('Comment'), 'Keep my draft');
  fireEvent.press(screen.getByLabelText('Post comment')); fireEvent.press(screen.getByLabelText('Post comment'));
  expect(jest.mocked(apiRequest).mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
  await act(async () => reject(new Error('Connection lost')));
  expect(screen.getByLabelText('Comment').props.value).toBe('Keep my draft');
  expect(screen.getByText('Connection lost')).toBeTruthy(); expect(close).not.toHaveBeenCalled();
  jest.mocked(apiRequest).mockResolvedValue({ id: 'new-comment', content: 'Keep my draft', user: { username: 'me' } });
  await act(async () => fireEvent.press(screen.getByLabelText('Post comment')));
  expect(posted).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
  expect(screen.getByText('Keep my draft')).toBeTruthy();
  expect(screen.getByLabelText('Comment').props.value).toBe('');
});

test('update download never reloads a call or draft automatically', async () => {
  jest.mocked(Updates.checkForUpdateAsync).mockResolvedValue({ isAvailable: true } as any);
  jest.mocked(Updates.fetchUpdateAsync).mockResolvedValue({ isNew: true } as any);
  jest.mocked(Updates.reloadAsync).mockResolvedValue(undefined as never);
  render(<AppUpdatesScreen />);
  expect(screen.getByText('App 1.0.13 · Build 98')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('Check for updates')));
  expect(Updates.fetchUpdateAsync).toHaveBeenCalledTimes(1);
  expect(Updates.reloadAsync).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByText('Restart and apply update')));
  expect(Updates.reloadAsync).toHaveBeenCalledTimes(1);
});

test('update check failure offers retry without showing a false success', async () => {
  jest.mocked(Updates.checkForUpdateAsync).mockRejectedValue(new Error('network'));
  render(<AppUpdatesScreen />);
  await act(async () => fireEvent.press(screen.getByText('Check for updates')));
  expect(screen.getByText('Could not check right now. Check your connection and try again.')).toBeTruthy();
  expect(screen.queryByText('Restart and apply update')).toBeNull();
});

test('message Done dismisses and sending preserves text typed during the request', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  let complete!: (data: any) => void;
  jest.mocked(apiRequest).mockImplementation((path, options) => {
    if (String(path).endsWith('/messages') && options?.method === 'POST') return new Promise(resolve => { complete = resolve; });
    return Promise.resolve({ data: [] });
  });
  render(<ThreadScreen />);
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining('/read'), expect.anything()));
  const input = screen.getByLabelText('Message');
  fireEvent.changeText(input, 'First'); fireEvent(input, 'focus');
  fireEvent.press(screen.getByLabelText('Done editing. Hide keyboard'));
  expect(dismiss).toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Send message')); fireEvent.press(screen.getByLabelText('Send message'));
  fireEvent.changeText(input, 'Second');
  await act(async () => complete({ id: 'sent', content: 'First', createdAt: new Date().toISOString() }));
  expect(input.props.value).toBe('Second');
  expect(jest.mocked(apiRequest).mock.calls.filter(call => call[1]?.method === 'POST' && String(call[0]).endsWith('/messages'))).toHaveLength(1);
});
