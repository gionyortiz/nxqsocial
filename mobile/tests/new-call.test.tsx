import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { startPrivateCall } from '@/lib/calls';
import NewCallScreen from '@/app/new-call';

jest.mock('@/lib/auth', () => ({ useAuth: () => ({ token: 'fixture', user: { username: 'me' } }) }));
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn() }));
jest.mock('@/lib/calls', () => ({ startPrivateCall: jest.fn() }));
jest.mock('@/lib/mediaPlayback', () => ({ pauseAllMedia: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));

const api = apiRequest as jest.Mock;
const start = startPrivateCall as jest.Mock;
beforeEach(() => {
  api.mockReset().mockResolvedValue({ data: [
    { participant: { username: 'me', displayName: 'Me' } },
    { participant: { username: 'ana', displayName: 'Ana' } },
    { participant: { username: 'luis', displayName: 'Luis' } },
    { participant: { username: 'ana', displayName: 'Ana' } },
  ] });
  start.mockReset().mockResolvedValue('group-family');
});

test('deduplicates recent people, excludes self, and starts a selected group', async () => {
  render(<NewCallScreen />);
  await screen.findByLabelText('Ana');
  expect(screen.queryByLabelText('Me')).toBeNull();
  expect(screen.getAllByLabelText('Ana')).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('Ana'));
  fireEvent.press(screen.getByLabelText('Luis'));
  fireEvent.press(screen.getByText('Video call'));
  await waitFor(() => expect(start).toHaveBeenCalledWith('fixture', ['ana', 'luis'], true));
  expect(router.replace).toHaveBeenCalledWith({ pathname: '/call', params: { room: 'group-family' } });
});

test('ignores repeated start taps while a voice invitation is pending', async () => {
  let finish!: (room: string) => void;
  start.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  render(<NewCallScreen />); await screen.findByLabelText('Ana');
  fireEvent.press(screen.getByLabelText('Ana'));
  fireEvent.press(screen.getByText('Voice call'));
  fireEvent.press(screen.getByText('Voice call'));
  expect(start).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledWith('fixture', ['ana'], false);
  await act(async () => finish('call-family'));
});
