'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { formatCount, timeAgo, cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface MediaAsset {
  id: string;
  url: string;
  thumbnailUrl?: string;
  mimeType: string;
}

interface Post {
  id: string;
  caption?: string;
  type: string;
  aiLabel?: string;
  createdAt: string;
  isLiked: boolean;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    verificationStatus: string;
    trustScore: number;
  };
  media: MediaAsset[];
  _count: { likes: number; comments: number };
}

interface PostCardProps {
  post: Post;
  onCommentClick?: (postId: string) => void;
  onDelete?: (postId: string) => void;
}

const AI_LABEL_TEXT: Record<string, string> = {
  AI_GENERATED: '🤖 AI-generated content',
  AI_EDITED: '✏️ AI-edited content',
  SOURCE_UNKNOWN: '❓ Source unverified',
};

export function PostCard({ post, onCommentClick, onDelete }: PostCardProps) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post._count.likes);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user: me } = useAuthStore();
  const isMe = me?.username === post.author.username;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/posts/${post.id}`);
      onDelete?.(post.id);
    } catch {
      // ignore
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };
  const mediaBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000';
  const firstMedia = post.media?.[0];
  const mediaSrc = firstMedia
    ? (firstMedia.url.startsWith('http') ? firstMedia.url : `${mediaBase}${firstMedia.url}`)
    : null;
  const isVideo = (firstMedia?.mimeType?.startsWith('video/') ?? false) || post.type === 'VIDEO' || post.type === 'SHORT_VIDEO';

  const toggleLike = async () => {
    try {
      setLiked((p) => !p);
      setLikeCount((c) => liked ? c - 1 : c + 1);
      const { data } = await api.post(`/likes/${post.id}`);
      setLiked(data.liked);
      setLikeCount(data.count);
    } catch {
      setLiked((p) => !p);
      setLikeCount((c) => liked ? c + 1 : c - 1);
    }
  };

  const toggleSave = () => api.post(`/posts/${post.id}/save`).catch(() => null);

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* AI label warning */}
      {post.aiLabel && AI_LABEL_TEXT[post.aiLabel] && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 text-xs text-amber-700">
          {AI_LABEL_TEXT[post.aiLabel]}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Link href={`/profile/${post.author.username}`}>
          <Avatar src={post.author.avatarUrl} alt={post.author.username} size="md" />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.author.username}`} className="flex items-center gap-1">
            <span className="font-semibold text-sm text-gray-900 truncate">{post.author.displayName}</span>
            <TrustBadge status={post.author.verificationStatus} />
          </Link>
          <p className="text-xs text-gray-400">@{post.author.username} · {timeAgo(post.createdAt)}</p>
        </div>
        {isMe && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <MoreHorizontal size={20} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 w-40 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} /> Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Media */}
      {mediaSrc && (
        <div className="bg-black aspect-square relative">
          {isVideo ? (
            <video
              src={mediaSrc}
              className="w-full h-full object-contain"
              controls
              preload="metadata"
              poster={firstMedia?.thumbnailUrl ?? undefined}
            />
          ) : (
            <Image
              src={mediaSrc}
              alt={post.caption ?? 'Post'}
              fill
              className="object-contain"
              sizes="(max-width: 640px) 100vw, 600px"
            />
          )}
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-4">
        <button
          onClick={toggleLike}
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium transition-colors',
            liked ? 'text-red-500' : 'text-gray-500 hover:text-red-400',
          )}
        >
          <Heart size={22} fill={liked ? 'currentColor' : 'none'} />
          <span>{formatCount(likeCount)}</span>
        </button>

        <button
          onClick={() => onCommentClick?.(post.id)}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-purple-500 transition-colors"
        >
          <MessageCircle size={22} />
          <span>{formatCount(post._count.comments)}</span>
        </button>

        <button onClick={toggleSave} className="text-gray-400 hover:text-yellow-500 transition-colors" title="Save post">
          <Bookmark size={20} />
        </button>

        <button className="ml-auto text-gray-400 hover:text-gray-600 transition-colors" title="Share">
          <Share2 size={20} />
        </button>
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm text-gray-800">
            <Link href={`/profile/${post.author.username}`} className="font-semibold mr-1">
              {post.author.username}
            </Link>
            {post.caption}
          </p>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Delete post?</h3>
            <p className="text-sm text-gray-500 mb-6">This will permanently remove this post. This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
