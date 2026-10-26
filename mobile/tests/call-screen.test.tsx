import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AudioSession, useLocalParticipant, useParticipants } from '@livekit/react-native';
import { mediaDevices } from '@livekit/react-native-webrtc';
import CallScreen from '@/app/call';
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn() }));
jest.mock('@/lib/auth', () => ({ useAuth: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));
const mockRoomProps = jest.fn();
jest.mock('@livekit/react-native', () => ({
  LiveKitRoom: (props: any) => { mockRoomProps(props); return <>{props.children}</>; },
  VideoTrack: 'MockVideo', isTrackReference: () => false,
  useConnectionState: () => 'connected', useLocalParticipant: jest.fn(), useParticipants: jest.fn(), useTracks: () => [],
  AudioSession: { configureAudio: jest.fn(), startAudioSession: jest.fn(), stopAudioSession: jest.fn(), selectAudioOutput: jest.fn() },
}));
jest.mock('@livekit/react-native-webrtc', () => ({ mediaDevices: { getUserMedia: jest.fn() } }));
jest.mock('livekit-client', () => ({ ConnectionState: { Connected: 'connected', Reconnecting: 'reconnecting' }, Track: { Source: { Camera: 'camera' } }, LocalVideoTrack: class {} }));
const api = apiRequest as jest.Mock;
const stopTrack = jest.fn();
const mic = jest.fn(); const camera = jest.fn();
const state = { room: 'group-family', callerId: 'me', video: true, group: true, createdAt: Date.now(), expiresAt: Date.now() + 7200000, status: 'active', members: [
  { id: 'me', displayName: 'Me', state: 'joined' }, { id: 'one', displayName: 'One', state: 'joined' }, { id: 'two', displayName: 'Two', state: 'joined' },
] };
beforeEach(() => {
  (useAuth as jest.Mock).mockReturnValue({ token: 'fixture', user: { id: 'me' } });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ room: 'group-family' });
  (mediaDevices.getUserMedia as jest.Mock).mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  for (const fn of Object.values(AudioSession)) (fn as jest.Mock).mockResolvedValue(undefined);
  mic.mockReset().mockResolvedValue(undefined); camera.mockReset().mockResolvedValue(undefined);
  (useLocalParticipant as jest.Mock).mockReturnValue({ localParticipant: { identity: 'me', isCameraEnabled: true, setMicrophoneEnabled: mic, setCameraEnabled: camera }, isMicrophoneEnabled: true, isCameraEnabled: true });
  (useParticipants as jest.Mock).mockReturnValue([{ identity: 'me', isLocal: true, name: 'Me' }, { identity: 'one', name: 'One' }, { identity: 'two', name: 'Two' }]);
  api.mockReset().mockImplementation((path: string) => Promise.resolve(path === '/calls/token' ? { token: 'room-token', url: 'wss://fixture.invalid' } : state));
});
test('joins after permissions, stops temporary capture, and shows all three people', async () => {
  render(<CallScreen />);
  await screen.findByText('3 people connected');
  expect(screen.getByText('You')).toBeTruthy(); expect(screen.getByText('One')).toBeTruthy(); expect(screen.getByText('Two')).toBeTruthy();
  expect(stopTrack).toHaveBeenCalled(); expect(AudioSession.startAudioSession).toHaveBeenCalledTimes(1);
  expect(api).toHaveBeenCalledWith('/calls/token', expect.objectContaining({ body: { room: 'group-family', video: true } }));
});
test('mic and camera controls change tracks without issuing a second room token', async () => {
  render(<CallScreen />); await screen.findByText('3 people connected');
  fireEvent.press(screen.getByLabelText('Mute')); await waitFor(() => expect(mic).toHaveBeenCalledWith(false));
  await act(async () => {}); fireEvent.press(screen.getByLabelText('Camera off'));
  await waitFor(() => expect(camera).toHaveBeenCalledWith(false));
  expect(api.mock.calls.filter(([path]) => path === '/calls/token')).toHaveLength(1);
});
test('permission denial does not join and releases the call', async () => {
  (mediaDevices.getUserMedia as jest.Mock).mockRejectedValue(new Error('Microphone denied'));
  render(<CallScreen />); await screen.findByText('Microphone denied');
  expect(api.mock.calls.some(([p]) => p === '/calls/token')).toBe(false);
  expect(api).toHaveBeenCalledWith('/calls/leave', expect.any(Object));
  expect(AudioSession.stopAudioSession).toHaveBeenCalled();
});
test('cancel during the permission prompt never connects after permission resolves', async () => {
  let finish!: (stream: unknown) => void;
  (mediaDevices.getUserMedia as jest.Mock).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const view = render(<CallScreen />); await waitFor(() => expect(mediaDevices.getUserMedia).toHaveBeenCalled());
  fireEvent.press(screen.getByText('Cancel')); await waitFor(() => expect(router.back).toHaveBeenCalled());
  view.unmount(); await act(async () => finish({ getTracks: () => [{ stop: stopTrack }] }));
  expect(stopTrack).toHaveBeenCalled(); expect(api.mock.calls.some(([p]) => p === '/calls/token')).toBe(false);
});
test('leaving a group uses leave, not end-for-everyone', async () => {
  render(<CallScreen />); await screen.findByText('3 people connected');
  fireEvent.press(screen.getByLabelText('Leave call')); await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(api).toHaveBeenCalledWith('/calls/leave', expect.objectContaining({ body: { room: 'group-family' } }));
  expect(api.mock.calls.some(([p]) => p === '/calls/end')).toBe(false);
});
test('a failed connection disconnects and stops the audio session', async () => {
  render(<CallScreen />); await screen.findByText('3 people connected');
  await act(async () => mockRoomProps.mock.calls.at(-1)![0].onError(new Error('failed')));
  await screen.findByText('Could not join');
  expect(api).toHaveBeenCalledWith('/calls/leave', expect.any(Object)); expect(AudioSession.stopAudioSession).toHaveBeenCalled();
});
test('an already ended call does not request device capture', async () => {
  api.mockResolvedValue({ ...state, status: 'ended', reason: 'no_answer' });
  render(<CallScreen />); await screen.findByText('No answer. Try calling again later.');
  expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
});

test('a voice-only invitation does not request or publish camera video', async () => {
  api.mockImplementation((path: string) => Promise.resolve(path === '/calls/token'
    ? { token: 'room-token', url: 'wss://fixture.invalid' } : { ...state, video: false }));
  render(<CallScreen />); await screen.findByText('3 people connected');
  expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
  expect(mockRoomProps.mock.calls.at(-1)![0].video).toBe(false);
  expect(AudioSession.selectAudioOutput).not.toHaveBeenCalled();
});
