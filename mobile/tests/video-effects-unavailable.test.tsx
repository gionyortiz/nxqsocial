import React from 'react';
import { render } from '@testing-library/react-native';
import { VideoEffectsButton } from '../components/VideoEffectsButton';
import { editVideo, videoEffectsAvailable, removeEditedVideo } from '../modules/nxq-video-effects';

jest.mock('expo-modules-core', () => ({ requireOptionalNativeModule: () => null }));
jest.mock('@expo/vector-icons', () => ({ MaterialCommunityIcons: 'MockIcon' }));

test('a binary without the video module keeps the composer usable and hides unavailable controls', () => {
  expect(videoEffectsAvailable).toBe(false);
  const view = render(<VideoEffectsButton uri="file:///original.mp4" value={null} disabled={false} onChange={jest.fn()} onBusy={jest.fn()} />);
  expect(view.queryByLabelText('Edit video filters and beauty')).toBeNull();
});

test('missing native support returns an actionable error without breaking cleanup', async () => {
  await expect(editVideo('file:///original.mp4')).rejects.toThrow('latest NXQ iPhone app');
  await expect(removeEditedVideo('file:///original.mp4')).resolves.toBeUndefined();
});
