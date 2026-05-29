'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Grid, Film, MapPin, Globe, Calendar, ShieldCheck,
  Trash2, Heart, MessageCircle, Share2, UserPlus, Settings,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { formatCount } from '@/lib/utils';

interface MediaAsset { id: string; url: string; mimeType: string; }
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

function mediaSrc(url: string) { return url; }

function formatJoinDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function displayWebsite(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user: me, updateUser } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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
      .catch(() => {});
  }, [username]);

  const toggleFollow = async () => {
    try {
      setFollowing((f) => !f);
      setFollowerCount((c) => following ? c - 1 : c + 1);
      await api.post(`/users/${username}/follow`);
    } catch {
      setFollowing((f) => !f);
      setFollowerCount((c) => following ? c + 1 : c - 1);
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

  const isMe = me?.username === username;
  const filteredPosts = posts.filter((p) =>
    tab === 'reels'
      ? (p.type === 'VIDEO' || p.type === 'SHORT_VIDEO')
      : (p.type === 'PHOTO' || p.type === 'TEXT'),
  );

  if (!profile) {
    return (
      <AppShell>
        <div className="flex justify-center pt-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">

        {/* ── Banner ─────────────────────────────────────────────────────── */}
        <div className="relative h-52 sm:h-64 w-full overflow-hidden">
          {profile.bannerUrl ? (
            <Image src={mediaSrc(profile.bannerUrl)} alt="banner" fill className="object-cover" sizes="100vw" priority />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-purple-700 via-violet-600 to-pink-500" />
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/20 to-transparent" />
        </div>

        {/* ── Profile card ───────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 bg-white border-b border-gray-100 pb-5">

          {/* Avatar + action buttons row */}
          <div className="flex items-end justify-between -mt-12 sm:-mt-14 mb-4">
            <div className="relative">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full ring-4 ring-white bg-white overflow-hidden shadow-xl">
                <Avatar src={profile.avatarUrl} alt={profile.username} size="xl" className="w-full h-full" />
              </div>
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
                    className="p-2 rounded-full border-2 border-gray-200 text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-all"
                    title="Share profile"
                  >
                    <Share2 size={14} />
                  </button>
                </>
              ) : (
                <>
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
                    className="p-2 rounded-full border-2 border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
                    title="Share profile"
                  >
                    <Share2 size={14} />
                  </button>
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
                href={profile.website}
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

          {/* Trust score */}
          {profile.trustScore > 0 && (
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100">
                <ShieldCheck size={13} className="text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">Trust Score: {profile.trustScore}/100</span>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex divide-x divide-gray-100 border border-gray-100 rounded-2xl overflow-hidden bg-gray-50/60">
            {[
              { label: 'Posts', value: profile._count.posts },
              { label: 'Followers', value: followerCount },
              { label: 'Following', value: profile._count.following },
            ].map(({ label, value }) => (
              <div key={label} className="flex-1 text-center py-3.5 hover:bg-white transition-colors cursor-default">
                <div className="text-xl font-black text-gray-900">{formatCount(value)}</div>
                <div className="text-xs text-gray-500 font-semibold mt-0.5 uppercase tracking-widest">{label}</div>
              </div>
            ))}
          </div>
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
                const isVideo = first?.mimeType?.startsWith('video/');
                return (
                  <div key={post.id} className="group relative aspect-square bg-gray-100 overflow-hidden">
                    {src && (isVideo ? (
                      <video src={src} className="w-full h-full object-cover" muted />
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

      {/* ── Edit profile modal ─────────────────────────────────────────────── */}
      {editOpen && (
        <ProfileEditModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onSaved={handleProfileSaved}
        />
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
    </AppShell>
  );
}
