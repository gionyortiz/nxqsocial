'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  Sparkles,
  Bot,
  HelpCircle,
  Flag,
  CheckCircle2,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { formatCount, timeAgo, cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { EngagementListModal } from './EngagementListModal';

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

const AI_LABEL_CONFIG: Record<string, { text: string; icon: React.ElementType; color: string }> = {
  AI_GENERATED: { text: 'AI-generated content', icon: Bot,      color: 'bg-violet-50 border-violet-200 text-violet-700' },
  AI_EDITED:    { text: 'AI-assisted edit',      icon: Sparkles, color: 'bg-sky-50 border-sky-200 text-sky-700' },
  SOURCE_UNKNOWN:{ text: 'Source unverified',    icon: HelpCircle, color: 'bg-amber-50 border-amber-200 text-amber-700' },
};

// Legacy fallback
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
  const [engagementTab, setEngagementTab] = useState<'likes' | 'comments' | null>(null);
  const [heartAnim, setHeartAnim] = useState(false);
  const [floatHeart, setFloatHeart] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('SPAM');
  const [reporting, setReporting] = useState(false);
  const [reportDone, setReportDone] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const doubleTapRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { user: me } = useAuthStore();
  const isMe = me?.username === post.author.username;
  const isVerified = post.author.verificationStatus === 'ID_VERIFIED';

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

  const handleReport = async () => {
    setReporting(true);
    try {
      await api.post('/reports', { reason: reportReason, reportedPostId: post.id });
      setReportDone(true);
      setTimeout(() => { setReportOpen(false); setReportDone(false); }, 1800);
    } catch {
      setReportOpen(false);
    } finally {
      setReporting(false);
    }
  };

  const triggerLikeAnim = useCallback(() => {
    setHeartAnim(false);
    requestAnimationFrame(() => {
      setHeartAnim(true);
      setFloatHeart(true);
      setTimeout(() => setHeartAnim(false), 400);
      setTimeout(() => setFloatHeart(false), 900);
    });
  }, []);

  const handleDoubleTap = useCallback(() => {
    if (!liked) {
      triggerLikeAnim();
      setLiked(true);
      setLikeCount((c) => c + 1);
      api.post(`/posts/${post.id}/likes`).catch(() => {
        setLiked(false);
        setLikeCount((c) => c - 1);
      });
    } else {
      triggerLikeAnim();
    }
  }, [liked, post.id, triggerLikeAnim]);

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
    if (!liked) triggerLikeAnim();
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
    <article className="group bg-white dark:bg-[#111827] rounded-3xl overflow-hidden shadow-[var(--shadow-card)] border border-[var(--border)] transition-all duration-200 hover:shadow-[0_4px_28px_rgba(15,23,42,0.12)] animate-fade-in-up">

      {/* ── AI label ─────────────────────────────────────────────── */}
      {post.aiLabel && AI_LABEL_CONFIG[post.aiLabel] && (() => {
        const cfg = AI_LABEL_CONFIG[post.aiLabel!];
        const Icon = cfg.icon;
        return (
          <div className={cn('flex items-center gap-2 px-4 py-2 border-b text-xs font-medium', cfg.color)}>
            <Icon size={13} />
            {cfg.text}
          </div>
        );
      })()}

      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Link href={`/profile/${post.author.username}`}>
          {isVerified ? (
            <span className="ring-verified">
              <span className="block rounded-full overflow-hidden bg-white dark:bg-[#111827] p-[2px]">
                <Avatar src={post.author.avatarUrl} alt={post.author.username} size="md" />
              </span>
            </span>
          ) : (
            <Avatar src={post.author.avatarUrl} alt={post.author.username} size="md" />
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.author.username}`} className="flex items-center gap-1.5 group/author">
            <span className="font-bold text-[15px] text-gray-900 dark:text-gray-100 truncate group-hover/author:text-purple-700 dark:group-hover/author:text-purple-400 transition-colors">
              {post.author.displayName}
            </span>
            <TrustBadge status={post.author.verificationStatus} />
          </Link>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            @{post.author.username}
            <span className="mx-1.5 opacity-40">·</span>
            {timeAgo(post.createdAt)}
          </p>
        </div>
        {isMe && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-44 bg-white dark:bg-[#1f2937] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden animate-slide-up">
                <button
                  onClick={() => { setMenuOpen(false); setConfirmDelete(true); }}
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={15} /> Delete post
                </button>
              </div>
            )}
          </div>
        )}
        {!isMe && (
          <button
            onClick={() => setReportOpen(true)}
            className="p-2 rounded-full text-gray-300 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
            title="Report post"
          >
            <Flag size={17} />
          </button>
        )}
      </div>

      {/* ── Media ────────────────────────────────────────────────── */}
      {mediaSrc && (
        <div
          className={cn('bg-black relative overflow-hidden', isVideo ? 'aspect-[4/5] md:aspect-[16/10]' : 'aspect-[4/5]')}
          onDoubleClick={handleDoubleTap}
        >
          {/* Blurred bg for non-cover fit */}
          {thumbnailSrc && (
            <Image
              src={thumbnailSrc}
              alt=""
              fill
              className="object-cover scale-110 blur-3xl opacity-30 pointer-events-none"
              sizes="1px"
            />
          )}

          {/* Main media */}
          {isVideo ? (
            onOpenVideo ? (
              <button
                type="button"
                onClick={() => onOpenVideo(post.id)}
                className="group/play w-full h-full relative"
                aria-label="Play video"
              >
                {thumbnailSrc ? (
                  <Image
                    src={thumbnailSrc}
                    alt={post.caption ?? 'Video preview'}
                    fill
                    className="object-contain md:object-cover"
                    sizes="(max-width: 640px) 100vw, 800px"
                  />
                ) : (
                  <video
                    src={mediaSrc}
                    className="w-full h-full object-contain md:object-cover pointer-events-none"
                    muted playsInline preload="metadata"
                  />
                )}
                {/* Play button */}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-16 h-16 rounded-full glass-dark flex items-center justify-center group-hover/play:scale-110 transition-transform">
                    <Play size={26} className="text-white translate-x-0.5" fill="white" />
                  </span>
                </span>
                {/* Bottom gradient for readability */}
                <span className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              </button>
            ) : (
              <video
                src={mediaSrc}
                className="w-full h-full object-contain md:object-cover"
                controls preload="metadata"
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

          {/* Bottom gradient overlay */}
          <span className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />

          {/* Double-tap heart burst */}
          {floatHeart && (
            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <Heart
                size={80}
                fill="white"
                className="text-white drop-shadow-2xl animate-float-heart"
              />
            </span>
          )}
        </div>
      )}

      {/* ── Engagement bar ───────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {/* Like */}
            <button
              onClick={toggleLike}
              className={cn(
                'relative flex items-center gap-1.5 h-10 px-3 rounded-2xl font-semibold text-sm transition-all duration-150',
                liked
                  ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20'
                  : 'text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20',
              )}
            >
              <Heart
                size={20}
                fill={liked ? 'currentColor' : 'none'}
                className={heartAnim ? 'animate-heart-burst' : 'transition-transform'}
              />
              <span className={cn('tabular-nums', heartAnim && 'animate-count-up')}>
                {formatCount(likeCount)}
              </span>
            </button>

            {/* Comment */}
            <button
              onClick={() => onCommentClick?.(post.id)}
              className="flex items-center gap-1.5 h-10 px-3 rounded-2xl text-sm font-semibold text-gray-500 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all"
            >
              <MessageCircle size={20} />
              <span className="tabular-nums">{formatCount(post._count.comments)}</span>
            </button>

            {/* Repost */}
            <button
              onClick={toggleRepost}
              className={cn(
                'flex items-center gap-1.5 h-10 px-3 rounded-2xl text-sm font-semibold transition-all',
                reposted
                  ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'
                  : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
              )}
            >
              <Repeat2 size={20} />
              {repostCount > 0 && <span className="tabular-nums">{formatCount(repostCount)}</span>}
            </button>

            {/* Share */}
            <button
              onClick={sharePost}
              className="flex items-center gap-1.5 h-10 px-3 rounded-2xl text-sm font-semibold text-gray-500 hover:text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-all"
            >
              <Send size={19} />
            </button>
          </div>

          {/* Save */}
          <button
            onClick={toggleSave}
            className={cn(
              'flex items-center justify-center h-10 w-10 rounded-2xl transition-all',
              saved
                ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20',
            )}
          >
            <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* Engagement counts (clickable) */}
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 px-1">
          <button
            onClick={() => setEngagementTab('likes')}
            className="hover:text-purple-600 hover:underline transition-colors font-medium"
          >
            {formatCount(likeCount)} likes
          </button>
          <span className="opacity-40">·</span>
          <button
            onClick={() => setEngagementTab('comments')}
            className="hover:text-purple-600 hover:underline transition-colors font-medium"
          >
            {formatCount(post._count.comments)} comments
          </button>
          {repostCount > 0 && (
            <>
              <span className="opacity-40">·</span>
              <span className="font-medium">{formatCount(repostCount)} reposts</span>
            </>
          )}
        </div>
      </div>

      {/* ── Caption ──────────────────────────────────────────────── */}
      {caption && (
        <div className="px-4 pb-4 pt-0.5">
          <p className="text-[14.5px] leading-6 text-gray-800 dark:text-gray-200">
            <Link
              href={`/profile/${post.author.username}`}
              className="font-bold mr-1.5 text-gray-900 dark:text-gray-100 hover:text-purple-700 dark:hover:text-purple-400 transition-colors"
            >
              {post.author.username}
            </Link>
            <span className="break-words">{captionText}</span>
            {shouldTruncateCaption && !captionExpanded && (
              <button
                type="button"
                onClick={() => setCaptionExpanded(true)}
                className="ml-1.5 text-gray-400 hover:text-gray-600 font-semibold text-sm"
              >
                more
              </button>
            )}
          </p>
        </div>
      )}

      {/* ── Delete confirm modal ──────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1f2937] rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center animate-slide-up">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">Delete post?</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">This will permanently remove this post and cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-3 rounded-2xl border border-[var(--border)] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report modal ─────────────────────────────────────────── */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#1f2937] rounded-3xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            {reportDone ? (
              <div className="flex flex-col items-center py-4 gap-3">
                <CheckCircle2 size={40} className="text-green-500" />
                <p className="font-bold text-gray-900 dark:text-gray-100">Report submitted</p>
                <p className="text-sm text-gray-500 text-center">Our moderation team will review this post.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Flag size={18} className="text-orange-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-gray-100">Report post</h3>
                    <p className="text-xs text-gray-500">Why are you reporting this?</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 mb-5">
                  {[
                    { value: 'SPAM', label: 'Spam or misleading' },
                    { value: 'HARASSMENT', label: 'Harassment or bullying' },
                    { value: 'HATE_SPEECH', label: 'Hate speech' },
                    { value: 'VIOLENCE', label: 'Violence or dangerous content' },
                    { value: 'NUDITY', label: 'Nudity or sexual content' },
                    { value: 'MISINFORMATION', label: 'False information' },
                    { value: 'OTHER', label: 'Other' },
                  ].map((r) => (
                    <button
                      key={r.value}
                      onClick={() => setReportReason(r.value)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all text-left',
                        reportReason === r.value
                          ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 ring-1 ring-orange-200'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5',
                      )}
                    >
                      <span className={cn('w-4 h-4 rounded-full border-2 flex-shrink-0', reportReason === r.value ? 'border-orange-500 bg-orange-500' : 'border-gray-300')} />
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setReportOpen(false)} className="flex-1 py-3 rounded-2xl border border-[var(--border)] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleReport} disabled={reporting} className="flex-1 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold disabled:opacity-60 transition-colors">
                    {reporting ? 'Submitting…' : 'Submit report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Engagement modal ─────────────────────────────────────── */}
      {engagementTab && (
        <EngagementListModal
          postId={post.id}
          initialTab={engagementTab}
          onClose={() => setEngagementTab(null)}
        />
      )}
    </article>
  );
}
