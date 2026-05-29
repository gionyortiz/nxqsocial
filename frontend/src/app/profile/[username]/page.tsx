'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import { Grid, Film, MapPin, Link2, Settings, Trash2, Heart } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TrustBadge } from '@/components/ui/TrustBadge';
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
  isFollowing: boolean;
  _count: { posts: number; followers: number; following: number };
}

interface Post {
  id: string;
  type: string;
  caption?: string;
  media: MediaAsset[];
  _count: { likes: number };
}

function mediaSrc(url: string) { return url.startsWith('http') ? url : url; }

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user: me } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  const isMe = me?.username === username;
  const filteredPosts = posts.filter((p) =>
    tab === 'reels' ? (p.type === 'VIDEO' || p.type === 'SHORT_VIDEO') : (p.type === 'PHOTO' || p.type === 'TEXT')
  );

  if (!profile) {
    return (
      <AppShell>
        <div className="flex justify-center pt-20">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        {/* Banner */}
        <div className="relative h-48 sm:h-56 w-full bg-gradient-to-br from-purple-600 via-violet-500 to-pink-500 overflow-hidden">
          {profile.bannerUrl && (
            <Image src={mediaSrc(profile.bannerUrl)} alt="banner" fill className="object-cover" sizes="100vw" />
          )}
          <div className="absolute inset-0 bg-black/10" />
        </div>

        {/* Profile info row */}
        <div className="px-4 sm:px-6 pb-4">
          <div className="flex items-end justify-between -mt-14 mb-4">
            <div className="relative">
              <div className="w-28 h-28 rounded-full ring-4 ring-white bg-white overflow-hidden shadow-lg">
                <Avatar src={profile.avatarUrl} alt={profile.username} size="xl" className="w-full h-full" />
              </div>
            </div>
            <div className="flex gap-2 mb-2">
              {isMe ? (
                <button className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  <Settings size={15} /> Edit profile
                </button>
              ) : (
                <Button variant={following ? 'secondary' : 'primary'} size="sm" onClick={toggleFollow} className="rounded-full px-5">
                  {following ? 'Following' : 'Follow'}
                </Button>
              )}
            </div>
          </div>

          {/* Name & bio */}
          <div className="mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{profile.displayName}</h1>
              <TrustBadge status={profile.verificationStatus} showLabel />
            </div>
            <p className="text-gray-500 text-sm mt-0.5">@{profile.username}</p>
            {profile.bio && <p className="text-sm text-gray-700 mt-2 leading-relaxed">{profile.bio}</p>}
            <div className="flex flex-wrap gap-3 mt-2">
              {profile.location && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={12} />{profile.location}
                </span>
              )}
              {profile.website && (
                <a href={profile.website} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-purple-500 hover:underline">
                  <Link2 size={12} />{profile.website}
                </a>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 py-3 border-t border-b border-gray-100">
            {[
              { label: 'Posts', value: profile._count.posts },
              { label: 'Followers', value: followerCount },
              { label: 'Following', value: profile._count.following },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-lg font-bold text-gray-900">{formatCount(value)}</div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-4 sm:px-6">
          <button
            onClick={() => setTab('posts')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'posts' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <Grid size={15} /> Posts
          </button>
          <button
            onClick={() => setTab('reels')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-semibold border-b-2 transition-colors ${tab === 'reels' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <Film size={15} /> Reels
          </button>
        </div>

        {/* Grid */}
        <div className="p-1 sm:p-2">
          {filteredPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Grid size={40} strokeWidth={1} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">No {tab} yet</p>
              {isMe && <p className="text-xs mt-1 text-gray-300">Share your first {tab === 'posts' ? 'photo' : 'reel'}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
              {filteredPosts.map((post) => {
                const first = post.media?.[0];
                const src = first ? mediaSrc(first.url) : null;
                const isVideo = first?.mimeType?.startsWith('video/');
                return (
                  <div key={post.id} className="group relative aspect-square bg-gray-100 overflow-hidden">
                    {src && (isVideo ? (
                      <video src={src} className="w-full h-full object-cover" />
                    ) : (
                      <Image src={src} alt={post.caption ?? 'post'} fill className="object-cover group-hover:scale-105 transition-transform duration-200" sizes="33vw" />
                    ))}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-200 flex items-center justify-center gap-4 opacity-0 group-hover:opacity-100">
                      <span className="flex items-center gap-1 text-white text-sm font-semibold drop-shadow">
                        <Heart size={18} fill="white" /> {formatCount(post._count.likes)}
                      </span>
                      {isMe && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(post.id); }}
                          className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-600 text-white transition-colors"
                          title="Delete post"
                        >
                          <Trash2 size={15} />
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

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <Trash2 size={22} className="text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Delete post?</h3>
            <p className="text-sm text-gray-500 mb-6">This will permanently delete the post and its media. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deletePost(confirmDelete)}
                disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-60"
              >
                {deletingId ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
