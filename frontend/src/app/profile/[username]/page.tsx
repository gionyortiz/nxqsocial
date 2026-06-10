'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Grid, Film, MapPin, Globe, Calendar, ShieldCheck,
  Trash2, Heart, MessageCircle, Share2, UserPlus, Settings, User,
  Ban, Phone, Video, X, ShieldAlert,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useCallStore } from '@/store/call';
import { fetchUserLive } from '@/lib/live';
import { callsVisible, startCall } from '@/lib/calls';
import { formatCount, resolveMediaUrl } from '@/lib/utils';

interface MediaAsset { id: string; url: string; thumbnailUrl?: string; mimeType: string; }
interface Profile {
  id: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  bannerUrl?: string;
  location?: string;
  website?: string;
  verificationStatus: string;
  trustScore: number;
  createdAt: string;
  isFollowing: boolean;
  _count: { posts: number; followers: number; following: number };
}
interface Post {
  id: string;
  type: string;
  caption?: string;
  media: MediaAsset[];
  _count: { likes: number; comments: number };
}

function mediaSrc(url: string) { return resolveMediaUrl(url); }

function formatJoinDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function normalizeWebsite(url: string) {
  if (!url) return '';
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function displayWebsite(url: string) {
  try { return new URL(normalizeWebsite(url)).hostname.replace(/^www\./, ''); } catch { return url; }
}

const VERIFIED_STATUSES = ['HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'];

function verificationLabel(status: string) {
  switch (status) {
    case 'ID_VERIFIED': return 'ID Verified';
    case 'HUMAN_VERIFIED': return 'Human Verified';
    case 'BUSINESS_VERIFIED': return 'Business Verified';
    default: return 'Basic';
  }
}

/** Compute profile completeness (0–100) and the list of remaining steps. */
function computeCompleteness(p: Profile) {
  const checks: { label: string; done: boolean }[] = [
    { label: 'Add a profile photo', done: !!p.avatarUrl },
    { label: 'Add a banner image', done: !!p.bannerUrl },
    { label: 'Write a bio', done: !!p.bio?.trim() },
    { label: 'Add your location', done: !!p.location?.trim() },
    { label: 'Add a website', done: !!p.website?.trim() },
    { label: 'Get verified', done: VERIFIED_STATUSES.includes(p.verificationStatus) },
  ];
  const done = checks.filter((c) => c.done).length;
  const percent = Math.round((done / checks.length) * 100);
  return { percent, checks, remaining: checks.filter((c) => !c.done) };
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user: me, updateUser } = useAuthStore();
  const beginCall = useCallStore((s) => s.start);
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [startingCall, setStartingCall] = useState(false);
  const [callPickerOpen, setCallPickerOpen] = useState(false);
  const [liveRoom, setLiveRoom] = useState<string | null>(null);
  const [lightboxPost, setLightboxPost] = useState<Post | null>(null);

  useEffect(() => {
    if (!lightboxPost) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxPost(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxPost]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      const live = await fetchUserLive(username);
      if (active) setLiveRoom(live?.room ?? null);
    };
    check();
    const id = setInterval(check, 20_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [username]);

  useEffect(() => {
    Promise.all([
      api.get(`/users/${username}`),
      api.get(`/posts/user/${username}`),
    ])
      .then(([{ data: p }, { data: pp }]) => {
        setProfile(p);
        setFollowing(p.isFollowing);
        setFollowerCount(p._count.followers);
        setPosts(pp.data);
      })
      .catch(() => setError('Profile not found'));
  }, [username]);

  const toggleFollow = async () => {
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    setFollowerCount((c) => nextFollowing ? c + 1 : Math.max(0, c - 1));
    try {
      await api.post(`/users/${username}/follow`);
    } catch {
      setFollowing(!nextFollowing);
      setFollowerCount((c) => nextFollowing ? Math.max(0, c - 1) : c + 1);
    }
  };

  const blockUser = async () => {
    setBlocking(true);
    try {
      await api.post(`/users/${username}/block`);
      setConfirmBlock(false);
      router.push('/feed');
    } catch {
      setBlocking(false);
    }
  };

  const deletePost = async (postId: string) => {
    setDeletingId(postId);
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      if (profile) setProfile({ ...profile, _count: { ...profile._count, posts: profile._count.posts - 1 } });
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  const handleProfileSaved = (updates: Partial<Profile>) => {
    setProfile((prev) => prev ? { ...prev, ...updates } : prev);
    updateUser(updates as any);
  };

  const startProfileCall = async (callType: 'voice' | 'video') => {
    if (startingCall || !profile) return;
    setStartingCall(true);
    setCallPickerOpen(false);
    try {
      const video = callType === 'video';
      const room = await startCall({ targets: [profile.username], callType, group: false });
      beginCall(room, {
        video,
        callType,
        peer: {
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      });
      router.push('/feed');
    } catch {
      // Best effort; if call setup fails we simply reset button state.
    } finally {
      setStartingCall(false);
    }
  };

  const isMe = me?.username === username;
  const isAdmin = me?.role === 'ADMIN' || me?.role === 'MODERATOR';
  const filteredPosts = posts.filter((p) =>
    tab === 'reels'
      ? (p.type === 'VIDEO' || p.type === 'SHORT_VIDEO')
      : (p.type === 'PHOTO' || p.type === 'TEXT'),
  );

  if (error) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center pt-24 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <User size={28} className="text-gray-400" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">{error}</h2>
          <p className="text-sm text-gray-500 mt-1">This user may not exist or the profile is unavailable.</p>
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="flex justify-center pt-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const isVerified = VERIFIED_STATUSES.includes(profile.verificationStatus);
  const completeness = computeCompleteness(profile);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto sm:px-4 sm:py-5">
        <div className="sm:rounded-3xl sm:shadow-[0_8px_40px_-12px_rgba(124,58,237,0.25)] sm:ring-1 sm:ring-gray-100 overflow-hidden bg-white">

        {/* ── Banner ─────────────────────────────────────────────────────── */}
        <div className="relative h-52 sm:h-64 w-full overflow-hidden">
          {profile.bannerUrl ? (
            <Image src={mediaSrc(profile.bannerUrl)} alt="banner" fill className="object-cover" sizes="100vw" priority />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-700 via-violet-600 to-pink-500">
              {/* decorative glow orbs */}
              <div className="absolute -top-10 -left-6 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
              <div className="absolute top-6 right-10 w-40 h-40 rounded-full bg-pink-300/20 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 w-56 h-32 rounded-full bg-violet-400/20 blur-3xl" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
        </div>

        {/* ── Profile card ───────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 bg-white border-b border-gray-100 pb-5">

          {/* Avatar + action buttons row */}
          <div className="flex items-end justify-between -mt-14 sm:-mt-16 mb-4">
            <div className="relative">
              <button
                type={liveRoom ? 'button' : undefined}
                onClick={liveRoom ? () => router.push(`/live/${encodeURIComponent(liveRoom)}`) : undefined}
                className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden block ${
                  liveRoom
                    ? 'p-[3px] bg-gradient-to-tr from-rose-500 to-red-600 cursor-pointer'
                    : 'ring-4 ring-white bg-white shadow-[0_8px_30px_-6px_rgba(124,58,237,0.45)]'
                }`}
              >
                <div className={`w-full h-full rounded-full overflow-hidden ${liveRoom ? 'ring-2 ring-white bg-white' : ''}`}>
                  <Avatar src={profile.avatarUrl} alt={profile.username} size="xl" className="w-full h-full" />
                </div>
              </button>
              {liveRoom && (
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-[2px] rounded-full bg-rose-600 text-white text-[9px] font-bold uppercase tracking-wide ring-2 ring-white">
                  Live
                </span>
              )}
              {VERIFIED_STATUSES.includes(profile.verificationStatus) && (
                <div className="absolute bottom-1 right-1 w-7 h-7 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 ring-4 ring-white flex items-center justify-center shadow-lg">
                  <ShieldCheck size={14} className="text-white" strokeWidth={2.5} />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 pb-1">
              {isMe ? (
                <>
                  <button
                    onClick={() => setEditOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all"
                  >
                    <Settings size={14} /> Edit profile
                  </button>
                  <button
                    onClick={() => router.push('/settings')}
                    className="p-2 rounded-full border-2 border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
                    title="Settings"
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    className="p-2 rounded-full border-2 border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
                    title="Share profile"
                  >
                    <Share2 size={14} />
                  </button>
                </>
              ) : (
                <>
                  {callsVisible(me?.role) && (
                    <button
                      onClick={() => setCallPickerOpen(true)}
                      disabled={startingCall}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-60"
                      title={`Call ${profile.displayName}`}
                    >
                      <Phone size={14} /> {startingCall ? 'Calling…' : 'Call'}
                    </button>
                  )}
                  <Button
                    variant={following ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={toggleFollow}
                    className="rounded-full px-5 font-semibold"
                  >
                    {following ? 'Following' : (
                      <span className="flex items-center gap-1.5"><UserPlus size={14} /> Follow</span>
                    )}
                  </Button>
                  <button
                    onClick={() => setConfirmBlock(true)}
                    className="p-2 rounded-full border-2 border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all"
                    title={`Block ${profile.displayName}`}
                  >
                    <Ban size={15} />
                  </button>
                  <button
                    className="p-2 rounded-full border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
                    title="Share profile"
                  >
                    <Share2 size={14} />
                  </button>
                  {/* Admin view button — only visible to admins */}
                  {isAdmin && !isMe && (
                    <button
                      onClick={() => router.push(`/admin?user=${profile.username}`)}
                      className="p-2 rounded-full border-2 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
                      title="Admin: view user details"
                    >
                      <ShieldAlert size={15} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Name / username / badge */}
          <div className="mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">{profile.displayName}</h1>
              <TrustBadge status={profile.verificationStatus} size="md" showLabel />
            </div>
            <p className="text-gray-500 text-sm mt-0.5 font-medium">@{profile.username}</p>
          </div>

          {/* Bio */}
          {profile.bio && (
            <p className="text-sm text-gray-700 leading-relaxed mb-3 max-w-lg">{profile.bio}</p>
          )}

          {/* Meta: location, website, joined */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4">
            {profile.location && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                <MapPin size={13} className="text-gray-400" />{profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={normalizeWebsite(profile.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-700 hover:underline font-medium transition-colors"
              >
                <Globe size={13} />{displayWebsite(profile.website)}
              </a>
            )}
            {profile.createdAt && (
              <span className="flex items-center gap-1.5 text-xs text-gray-400">
                <Calendar size={13} />Joined {formatJoinDate(profile.createdAt)}
              </span>
            )}
          </div>

          {/* Trust summary */}
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            <div className="rounded-2xl bg-gradient-to-b from-emerald-50 to-white ring-1 ring-emerald-100 px-3 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck size={13} className="text-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Trust Score</span>
              </div>
              <div className="text-lg font-black text-gray-900 leading-none">{profile.trustScore}<span className="text-xs font-semibold text-gray-400">/100</span></div>
              <div className="mt-2 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${Math.min(100, profile.trustScore)}%` }} />
              </div>
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-purple-50 to-white ring-1 ring-purple-100 px-3 py-3 flex flex-col">
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShieldCheck size={13} className={isVerified ? 'text-purple-500' : 'text-gray-300'} />
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Verification</span>
              </div>
              <div className="text-sm font-black text-gray-900 leading-tight">{verificationLabel(profile.verificationStatus)}</div>
              {!isVerified && isMe && (
                <button onClick={() => router.push('/verify')} className="mt-auto pt-1.5 text-[11px] font-semibold text-purple-600 hover:text-purple-700 text-left">Get verified →</button>
              )}
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-gray-50 to-white ring-1 ring-gray-100 px-3 py-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Calendar size={13} className="text-gray-400" />
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Member Since</span>
              </div>
              <div className="text-sm font-black text-gray-900 leading-tight">{formatJoinDate(profile.createdAt)}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Posts', value: profile._count.posts },
              { label: 'Followers', value: followerCount },
              { label: 'Following', value: profile._count.following },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="group relative text-center py-4 rounded-2xl bg-gradient-to-b from-gray-50 to-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-[0_4px_20px_-8px_rgba(124,58,237,0.4)] transition-all cursor-default overflow-hidden"
              >
                <div className="absolute inset-x-0 -top-px h-1 bg-gradient-to-r from-purple-500 to-pink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="text-2xl font-black text-gray-900 group-hover:gradient-text transition-all">{formatCount(value)}</div>
                <div className="text-[11px] text-gray-400 font-bold mt-0.5 uppercase tracking-[0.12em]">{label}</div>
              </div>
            ))}
          </div>

          {/* Profile completeness (own profile only) */}
          {isMe && completeness.percent < 100 && (
            <div className="mt-4 rounded-2xl ring-1 ring-purple-100 bg-gradient-to-br from-purple-50/60 to-white p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-900">Complete your profile</span>
                <span className="text-sm font-black gradient-text">{completeness.percent}%</span>
              </div>
              <div className="h-2 rounded-full bg-purple-100 overflow-hidden mb-3">
                <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${completeness.percent}%` }} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {completeness.remaining.map((step) => (
                  <button
                    key={step.label}
                    onClick={() => (step.label === 'Get verified' ? router.push('/verify') : setEditOpen(true))}
                    className="px-2.5 py-1 rounded-full bg-white ring-1 ring-purple-100 text-[11px] font-semibold text-purple-600 hover:ring-purple-300 hover:bg-purple-50 transition-all"
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div className="flex border-b border-gray-200 bg-white">
          {(['posts', 'reels'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 py-3.5 px-5 text-sm font-bold border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {t === 'posts' ? <Grid size={16} /> : <Film size={16} />}
              {t}
              {t === 'posts' && profile._count.posts > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold">
                  {formatCount(profile._count.posts)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Post grid ──────────────────────────────────────────────────── */}
        <div className="bg-white min-h-40">
          {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                {tab === 'posts' ? <Grid size={28} strokeWidth={1.5} /> : <Film size={28} strokeWidth={1.5} />}
              </div>
              <p className="text-base font-semibold text-gray-600">
                {isMe ? `You haven't posted any ${tab} yet` : `No ${tab} yet`}
              </p>
              {isMe && (
                <p className="text-sm mt-1 text-gray-400">
                  {tab === 'posts' ? 'Share your first photo with the world' : 'Share your first reel'}
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-px bg-gray-200">
              {filteredPosts.map((post) => {
                const first = post.media?.[0];
                const src = first ? mediaSrc(first.url) : null;
                const thumbnail = first?.thumbnailUrl ? mediaSrc(first.thumbnailUrl) : null;
                const isVideo = first?.mimeType?.startsWith('video/');
                return (
                  <div
                    key={post.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setLightboxPost(post)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setLightboxPost(post);
                      }
                    }}
                    className="group relative aspect-square bg-gray-100 overflow-hidden text-left cursor-zoom-in outline-none"
                    aria-label={`Open post by ${profile.username}`}
                  >
                    {src && (isVideo ? (
                      <>
                        {thumbnail ? (
                          <Image
                            src={thumbnail}
                            alt={post.caption ?? 'Video preview'}
                            fill
                            className="object-cover"
                            sizes="33vw"
                          />
                        ) : (
                          <video
                            src={src}
                            className="w-full h-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        )}
                      </>
                    ) : (
                      <Image
                        src={src}
                        alt={post.caption ?? 'post'}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-300 ease-out"
                        sizes="33vw"
                      />
                    ))}
                    {isVideo && (
                      <div className="absolute top-2 right-2 pointer-events-none">
                        <Film size={16} className="text-white drop-shadow-md" />
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-200 flex flex-col items-center justify-center gap-3">
                      <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <span className="flex items-center gap-1 text-white text-sm font-bold drop-shadow-lg">
                          <Heart size={18} fill="white" strokeWidth={0} />
                          {formatCount(post._count.likes)}
                        </span>
                        <span className="flex items-center gap-1 text-white text-sm font-bold drop-shadow-lg">
                          <MessageCircle size={18} fill="white" strokeWidth={0} />
                          {formatCount(post._count.comments)}
                        </span>
                      </div>
                      {isMe && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-red-500/90 hover:bg-red-600 text-white shadow-lg"
                          title="Delete post"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ── Lightbox preview ─────────────────────────────────────────────── */}
      {lightboxPost && (() => {
        const first = lightboxPost.media?.[0];
        const src = first ? mediaSrc(first.url) : null;
        const thumbnail = first?.thumbnailUrl ? mediaSrc(first.thumbnailUrl) : null;
        const isVideo = first?.mimeType?.startsWith('video/');
        return (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
            <button
              type="button"
              onClick={() => setLightboxPost(null)}
              className="absolute inset-0 w-full h-full cursor-zoom-out"
              aria-label="Close preview"
            />
            <div className="relative z-10 w-full max-w-5xl rounded-3xl overflow-hidden bg-black shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between px-4 py-3 bg-black/70 text-white border-b border-white/10">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">@{profile.username}</p>
                  {lightboxPost.caption ? <p className="text-xs text-white/70 truncate">{lightboxPost.caption}</p> : null}
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxPost(null)}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  aria-label="Close preview"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="relative bg-black flex items-center justify-center max-h-[82vh]">
                {src && isVideo ? (
                  <video
                    src={src}
                    controls
                    autoPlay
                    muted
                    playsInline
                    className="max-h-[82vh] w-full object-contain bg-black"
                    poster={thumbnail ?? undefined}
                  />
                ) : src ? (
                  <Image
                    src={src}
                    alt={lightboxPost.caption ?? 'Post preview'}
                    width={1600}
                    height={1200}
                    className="w-full h-auto max-h-[82vh] object-contain"
                    priority
                  />
                ) : null}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit profile modal ─────────────────────────────────────────────── */}
      {editOpen && (
        <ProfileEditModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={handleProfileSaved}
        />
      )}

      {/* ── Block confirm modal ────────────────────────────────────────────── */}
      {confirmBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Ban size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Block @{profile.username}?</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              They won&apos;t be able to follow you, and you&apos;ll unfollow each other. You can unblock anytime in Settings.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmBlock(false)}
                disabled={blocking}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={blockUser}
                disabled={blocking}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {blocking
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Blocking…</>
                  : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm modal ───────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Delete post?</h3>
            <p className="text-sm text-gray-500 mb-6 leading-relaxed">
              This will permanently remove the post and its media. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deletePost(confirmDelete)}
                disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deletingId
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting…</>
                  : 'Delete post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Call picker (desktop) ───────────────────────────────────────────── */}
      {callPickerOpen && callsVisible(me?.role) && !isMe && (
        <div className="hidden sm:flex fixed inset-0 z-50 items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-gray-900">Start call with {profile.displayName}</h3>
              <button
                type="button"
                onClick={() => setCallPickerOpen(false)}
                className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => startProfileCall('voice')}
                disabled={startingCall}
                className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <Phone size={17} className="text-emerald-600" />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Voice Call</span>
                  <span className="block text-xs text-gray-500">Start with microphone only</span>
                </span>
              </button>
              <button
                onClick={() => startProfileCall('video')}
                disabled={startingCall}
                className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <Video size={17} className="text-purple-600" />
                <span>
                  <span className="block text-sm font-semibold text-gray-900">Video Call</span>
                  <span className="block text-xs text-gray-500">Start with camera and microphone</span>
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCallPickerOpen(false)}
              className="mt-3 w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Call picker (mobile action sheet) ───────────────────────────────── */}
      {callPickerOpen && callsVisible(me?.role) && !isMe && (
        <div className="sm:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setCallPickerOpen(false)}
            className="absolute inset-0 w-full h-full"
            aria-label="Close call options"
          />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-white p-4 pb-6 shadow-2xl">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Call {profile.displayName}</h3>
            <div className="space-y-2">
              <button
                onClick={() => startProfileCall('voice')}
                disabled={startingCall}
                className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <Phone size={17} className="text-emerald-600" />
                <span className="text-sm font-semibold text-gray-900">Voice Call</span>
              </button>
              <button
                onClick={() => startProfileCall('video')}
                disabled={startingCall}
                className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-60"
              >
                <Video size={17} className="text-purple-600" />
                <span className="text-sm font-semibold text-gray-900">Video Call</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
