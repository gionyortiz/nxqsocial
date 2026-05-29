'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import { Grid, Film, MapPin, Link2 } from 'lucide-react';
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
  media: MediaAsset[];
  _count: { likes: number };
}

const mediaBase = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') ?? 'http://localhost:3000';
function mediaSrc(url: string) { return url.startsWith('http') ? url : `${mediaBase}${url}`; }

export default function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { user: me } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const [following, setFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

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
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Profile header */}
        <div className="flex items-start gap-6 mb-6">
          <Avatar src={profile.avatarUrl} alt={profile.username} size="xl" />
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold">{profile.displayName}</h1>
              <TrustBadge status={profile.verificationStatus} showLabel />
            </div>
            <p className="text-gray-500 text-sm mb-1">@{profile.username}</p>
            {profile.location && <p className="text-xs text-gray-400 flex items-center gap-1 mb-1"><MapPin size={11} />{profile.location}</p>}
            {profile.website && <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-500 flex items-center gap-1 mb-2 hover:underline"><Link2 size={11} />{profile.website}</a>}
            {profile.bio && <p className="text-sm text-gray-700 mb-4">{profile.bio}</p>}

            <div className="flex gap-6 text-sm mb-4">
              <div className="text-center"><span className="font-bold block">{formatCount(profile._count.posts)}</span><span className="text-gray-400">Posts</span></div>
              <div className="text-center"><span className="font-bold block">{formatCount(followerCount)}</span><span className="text-gray-400">Followers</span></div>
              <div className="text-center"><span className="font-bold block">{formatCount(profile._count.following)}</span><span className="text-gray-400">Following</span></div>
            </div>

            {!isMe && (
              <Button variant={following ? 'secondary' : 'primary'} size="sm" onClick={toggleFollow}>
                {following ? 'Following' : 'Follow'}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 mb-4">
          <button
            onClick={() => setTab('posts')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'posts' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400'}`}
          >
            <Grid size={16} /> Posts
          </button>
          <button
            onClick={() => setTab('reels')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${tab === 'reels' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-400'}`}
          >
            <Film size={16} /> Reels
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-1">
          {filteredPosts.map((post) => {
            const first = post.media?.[0];
            const src = first ? mediaSrc(first.url) : null;
            const isVideo = first?.mimeType?.startsWith('video/');
            return (
              <div key={post.id} className="relative aspect-square bg-gray-100 overflow-hidden rounded-md">
                {src && (isVideo ? (
                  <video src={src} className="w-full h-full object-cover" />
                ) : (
                  <Image src={src} alt="post" fill className="object-cover" sizes="33vw" />
                ))}
              </div>
            );
          })}
        </div>

        {filteredPosts.length === 0 && (
          <p className="text-center text-gray-400 py-12">No {tab} yet.</p>
        )}
      </div>
    </AppShell>
  );
}
