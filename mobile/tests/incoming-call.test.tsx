import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { IncomingCall } from '@/components/IncomingCall';
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useRouter: () => require('expo-router').router, usePathname: jest.fn(() => '/messages') }));
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn() }));
jest.mock('@/lib/mediaPlayback', () => ({ pauseAllMedia: jest.fn() }));
const mockReceived = jest.fn(); const mockResponse = jest.fn();
jest.mock('expo-notifications', () => ({
  addNotificationReceivedListener: (cb: unknown) => { mockReceived(cb); return { remove: jest.fn() }; },
  addNotificationResponseReceivedListener: (cb: unknown) => { mockResponse(cb); return { remove: jest.fn() }; },
}));
const api = apiRequest as jest.Mock;
const invitation = () => ({ room: 'call-family', createdAt: Date.now(), video: true, group: true, caller: { username: 'family', displayName: 'Family member' } });
beforeEach(() => {
  AppState.currentState = 'active';
  (usePathname as jest.Mock).mockReturnValue('/messages'); api.mockReset().mockResolvedValue(invitation());
});
test('answer opens the dedicated call screen without declining the invitation', async () => {
  render(<IncomingCall token="fixture" />); await screen.findByText('Family member');
  fireEvent.press(screen.getByLabelText('Answer call'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/call', params: { room: 'call-family' } });
  expect(api.mock.calls.some(([p]) => p === '/calls/decline')).toBe(false);
});
test('decline identifies the exact room instead of clearing a newer invitation', async () => {
  render(<IncomingCall token="fixture" />); await screen.findByText('Family member');
  fireEvent.press(screen.getByLabelText('Decline call'));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/calls/decline', { method: 'POST', token: 'fixture', body: { room: 'call-family' } }));
});
test('a delayed push is checked against the server and cannot open a stale call', async () => {
  api.mockResolvedValue(null);
  render(<IncomingCall token="fixture" />);
  await act(async () => mockResponse.mock.calls.at(-1)![0]({ notification: { request: { content: { data: invitation() } } } }));
  expect(screen.queryByText('Family member')).toBeNull(); expect(router.push).not.toHaveBeenCalled();
});
test('an expired invite is not displayed', async () => {
  api.mockResolvedValue({ ...invitation(), createdAt: Date.now() - 50000 });
  render(<IncomingCall token="fixture" />); await act(async () => {});
  expect(screen.queryByText('Family member')).toBeNull();
});
test('incoming prompts do not interrupt an existing call', async () => {
  (usePathname as jest.Mock).mockReturnValue('/call');
  render(<IncomingCall token="fixture" />); await act(async () => {});
  expect(api).not.toHaveBeenCalled(); expect(screen.queryByText('Family member')).toBeNull();
});
test('logged-out app does not poll or accept calls', async () => {
  render(<IncomingCall token={null} />); await act(async () => {});
  expect(api).not.toHaveBeenCalled();
});
