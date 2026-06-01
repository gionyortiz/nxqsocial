'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Heart,
  MessageCircle,
  Bookmark,
  MoreHorizontal,
  Trash2,
  Play,
  Repeat2,
  Send,
} from 'lucide-react';
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
  onOpenVideo?: (postId: string) => void;
}

const AI_LABEL_TEXT: Record<string, string> = {
  AI_GENERATED: '🤖 AI-generated content',
  AI_EDITED: '✏️ AI-edited content',
  SOURCE_UNKNOWN: '❓ Source unverified',
};

export function PostCard({ post, onCommentClick, onDelete, onOpenVideo }: PostCardProps) {
  const [liked, setLiked] = useState(post.isLiked);
  const [likeCount, setLikeCount] = useState(post._count.likes);
  const [saved, setSaved] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [captionExpanded, setCaptionExpanded] = useState(false);
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
  const thumbnailSrc = firstMedia?.thumbnailUrl
    ? (firstMedia.thumbnailUrl.startsWith('http')
        ? firstMedia.thumbnailUrl
        : `${mediaBase}${firstMedia.thumbnailUrl}`)
    : null;
  const isVideo =
    (firstMedia?.mimeType?.startsWith('video/') ?? false) ||
    post.type === 'VIDEO' ||
    post.type === 'SHORT_VIDEO';
  const commentCount = post._count.comments ?? 0;
  const caption = post.caption?.trim() ?? '';
  const shouldTruncateCaption = caption.length > 140;
  const captionText = shouldTruncateCaption && !captionExpanded ? `${caption.slice(0, 140).trim()}...` : caption;

  const toggleLike = async () => {
    try {
      setLiked((p) => !p);
      setLikeCount((c) => (liked ? c - 1 : c + 1));
      const { data } = await api.post(`/posts/${post.id}/likes`);
      setLiked(data.liked);
      setLikeCount(data.count);
    } catch {
      setLiked((p) => !p);
      setLikeCount((c) => (liked ? c + 1 : c - 1));
    }
  };

  const toggleSave = async () => {
    const previous = saved;
    setSaved((p) => !p);
    try {
      const { data } = await api.post(`/posts/${post.id}/save`);
      setSaved(!!data?.saved);
    } catch {
      setSaved(previous);
    }
  };

  const toggleRepost = () => {
    setReposted((prev) => {
      setRepostCount((count) => (prev ? Math.max(0, count - 1) : count + 1));
      return !prev;
    });
  };

  const sharePost = async () => {
    const postUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/feed?post=${post.id}`
        : `/feed?post=${post.id}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${post.author.username} on NXQ Social`,
          text: post.caption ?? 'Check out this post on NXQ Social',
          url: postUrl,
        });
        return;
      }
      await navigator.clipboard.writeText(postUrl);
    } catch {
      // no-op
    }
  };

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {post.aiLabel && AI_LABEL_TEXT[post.aiLabel] && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 text-xs text-amber-700">
          {AI_LABEL_TEXT[post.aiLabel]}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
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
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmDelete(true);
                  }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} /> Delete post
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {mediaSrc && (
        <div className={cn('bg-black relative overflow-hidden', isVideo ? 'aspect-[4/5] md:aspect-[5/4]' : 'aspect-[4/5]')}>
          {thumbnailSrc && (
            <Image
              src={thumbnailSrc}
              alt={post.caption ?? 'Post background'}
              fill
              className="object-cover scale-110 blur-2xl opacity-35"
              sizes="(max-width: 640px) 100vw, 800px"
            />
          )}
          {isVideo ? (
            onOpenVideo ? (
              <button
                type="button"
                onClick={() => onOpenVideo(post.id)}
                className="group w-full h-full relative"
                aria-label="Play video"
              >
                <video
                  src={mediaSrc}
                  className="w-full h-full object-contain md:object-cover pointer-events-none"
                  muted
                  playsInline
                  preload="metadata"
                  poster={thumbnailSrc ?? undefined}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-16 h-16 rounded-full bg-black/50 group-hover:bg-black/60 flex items-center justify-center transition-colors">
                    <Play size={28} className="text-white translate-x-0.5" fill="white" />
                  </span>
                </span>
              </button>
            ) : (
              <video
                src={mediaSrc}
                className="w-full h-full object-contain md:object-cover"
                controls
                preload="metadata"
                poster={thumbnailSrc ?? undefined}
              />
            )
          ) : (
            <Image
              src={mediaSrc}
              alt={post.caption ?? 'Post'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 800px"
            />
          )}
        </div>
      )}

      <div className="px-4 pt-3 pb-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={toggleLike}
              className={cn(
                'h-11 w-11 rounded-full flex items-center justify-center transition-colors',
                liked ? 'text-red-500 bg-red-50' : 'text-gray-700 hover:text-red-500 hover:bg-red-50/80',
              )}
              title="Like"
              aria-label="Like"
            >
              <Heart size={24} fill={liked ? 'currentColor' : 'none'} />
            </button>

            <button
              onClick={() => onCommentClick?.(post.id)}
              className="h-11 w-11 rounded-full flex items-center justify-center text-gray-700 hover:text-purple-600 hover:bg-purple-50 transition-colors"
              title="Comment"
              aria-label="Comment"
            >
              <MessageCircle size={24} />
            </button>

            <button
              onClick={toggleRepost}
              className={cn(
                'h-11 w-11 rounded-full flex items-center justify-center transition-colors',
                reposted ? 'text-indigo-600 bg-indigo-50' : 'text-gray-700 hover:text-indigo-600 hover:bg-indigo-50',
              )}
              title="Repost"
              aria-label="Repost"
            >
              <Repeat2 size={24} />
            </button>

            <button
              onClick={sharePost}
              className="h-11 w-11 rounded-full flex items-center justify-center text-gray-700 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
              title="Send"
              aria-label="Send"
            >
              <Send size={24} />
            </button>
          </div>

          <button
            onClick={toggleSave}
            className={cn(
              'h-11 w-11 rounded-full flex items-center justify-center transition-colors',
              saved ? 'text-amber-600 bg-amber-50' : 'text-gray-700 hover:text-amber-600 hover:bg-amber-50',
            )}
            title="Save"
            aria-label="Save"
          >
            <Bookmark size={24} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="mt-1.5 text-sm text-gray-700 font-medium flex items-center gap-3">
          <span>{formatCount(likeCount)} likes</span>
          <span>{formatCount(commentCount)} comments</span>
          <span>{formatCount(repostCount)} reposts</span>
        </div>
      </div>

      {caption && (
        <div className="px-4 pb-4 pt-0.5">
          <p className="text-[15px] leading-6 text-gray-800">
            <Link href={`/profile/${post.author.username}`} className="font-semibold mr-1.5 text-gray-900">
              {post.author.username}
            </Link>
            <span className="break-words">{captionText}</span>
            {shouldTruncateCaption && !captionExpanded && (
              <button
                type="button"
                onClick={() => setCaptionExpanded(true)}
                className="ml-1.5 text-gray-500 hover:text-gray-700 font-medium"
              >
                more
              </button>
            )}
          </p>
        </div>
      )}

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
