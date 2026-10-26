import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { CommentComposer } from '../components/CommentComposer';
import { apiRequest } from '../lib/api';
jest.mock('@/lib/api', () => ({ apiRequest: jest.fn() }));
const row = (id: string) => ({ id, content: `Comment ${id}`, user: { username: 'friend' } });
test('comments paginate without duplicates and a failed page leaves loaded comments visible', async () => {
  jest.mocked(apiRequest).mockResolvedValueOnce({ data: [row('1')], nextCursor: '1' });
  render(<CommentComposer post={{ id: 'post', author: { username: 'author' } } as any} token="fixture" onClose={jest.fn()} onPosted={jest.fn()} />);
  await act(async () => {});
  expect(screen.getByText('Comment 1')).toBeTruthy();
  jest.mocked(apiRequest).mockRejectedValueOnce(new Error('Offline'));
  await act(async () => { fireEvent.press(screen.getByText('Load more comments')); });
  expect(screen.getByText('Comment 1')).toBeTruthy(); expect(screen.getByText('Offline')).toBeTruthy();
  jest.mocked(apiRequest).mockResolvedValueOnce({ data: [row('1'), row('2')], nextCursor: null });
  await act(async () => { fireEvent.press(screen.getByText('Retry loading comments')); });
  expect(screen.getAllByText('Comment 1')).toHaveLength(1); expect(screen.getByText('Comment 2')).toBeTruthy();
  expect(apiRequest).toHaveBeenLastCalledWith('/posts/post/comments?cursor=1', { token: 'fixture' });
});
