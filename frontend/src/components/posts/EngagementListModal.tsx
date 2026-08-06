'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Heart, MessageCircle, Loader2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { api } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';

interface Person {
  id: string;
  username: string;
  verificationStatus?: string;
  profile?: {
    displayName?: string;
    avatarUrl?: string;
  };
}

interface LikeItem {
  id: string;
  createdAt: string;
  user: Person;
}

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  user: Person;
}

type Tab = 'likes' | 'comments';

export function EngagementListModal({
  postId,
  initialTab = 'likes',
  onClose,
}: {
  postId: string;
  initialTab?: Tab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [likes, setLikes] = useState<LikeItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [likesRes, commentsRes] = await Promise.all([
          api.get(`/posts/${postId}/likes`),
          api.get(`/posts/${postId}/comments`),
        ]);
        setLikes(Array.isArray(likesRes.data) ? likesRes.data : []);
        setComments(Array.isArray(commentsRes.data?.data) ? commentsRes.data.data : []);
      } catch {
        setError('Could not load engagement details.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [postId]);

  const activeList = tab === 'likes' ? likes : comments;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <button
        type="button"
        onClick={onClose}
        className="absolute inset-0 w-full h-full cursor-default"
        aria-label="Close engagement list"
      />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl bg-white dark:bg-[#111827] shadow-2xl overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400">Post activity</p>
            <h3 className="text-xl font-black text-gray-900 dark:text-gray-100">Who reacted</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-100 dark:border-white/10 bg-gray-50/70 dark:bg-white/[0.03]">
          <button
            type="button"
            onClick={() => setTab('likes')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
              tab === 'likes' ? 'text-purple-700 dark:text-purple-400 bg-white dark:bg-white/5' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
          >
            <Heart size={16} fill={tab === 'likes' ? 'currentColor' : 'none'} />
            Likes
          </button>
          <button
            type="button"
            onClick={() => setTab('comments')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors',
              tab === 'comments' ? 'text-purple-700 dark:text-purple-400 bg-white dark:bg-white/5' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
            )}
          >
            <MessageCircle size={16} />
            Comments
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-14 text-gray-500 dark:text-gray-400">
              <Loader2 size={18} className="animate-spin mr-2" /> Loading activity...
            </div>
          ) : error ? (
            <div className="px-5 py-10 text-center text-sm text-red-500">{error}</div>
          ) : activeList.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              {tab === 'likes' ? 'No likes yet.' : 'No comments yet.'}
            </div>
          ) : tab === 'likes' ? (
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              {likes.map((like) => (
                <Link
                  key={like.id}
                  href={`/profile/${like.user.username}`}
                  className="flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  <Avatar src={like.user.profile?.avatarUrl ?? null} alt={like.user.username} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">{like.user.profile?.displayName ?? like.user.username}</span>
                      <TrustBadge status={like.user.verificationStatus ?? 'BASIC'} size="sm" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">@{like.user.username}</p>
                  </div>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(like.createdAt)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-white/10">
              {comments.map((comment) => (
                <div key={comment.id} className="flex items-start gap-3 px-5 py-4">
                  <Link href={`/profile/${comment.user.username}`} className="shrink-0">
                    <Avatar src={comment.user.profile?.avatarUrl ?? null} alt={comment.user.username} size="md" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/profile/${comment.user.username}`} className="font-semibold text-gray-900 dark:text-gray-100 hover:underline">
                        {comment.user.profile?.displayName ?? comment.user.username}
                      </Link>
                      <TrustBadge status={comment.user.verificationStatus ?? 'BASIC'} size="sm" />
                      <span className="text-xs text-gray-400 dark:text-gray-500">{timeAgo(comment.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
