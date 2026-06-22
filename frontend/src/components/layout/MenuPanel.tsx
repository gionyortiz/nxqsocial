'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import {
  X, Home, Compass, Play, ShieldCheck, Settings, LogOut,
  ShieldAlert, Image as ImageIcon, Film, Phone, Radio, MessageSquare, Bell, BookOpen,
} from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { useAuthStore } from '@/store/auth';
import { callsVisible } from '@/lib/calls';
import { liveVisible } from '@/lib/live';

interface Props {
  onClose: () => void;
}

const SHORTCUTS = [
  { href: '/feed',     icon: Home,        label: 'Home',     desc: 'Your main feed of posts and reels' },
  { href: '/notifications', icon: Bell,    label: 'Notifications', desc: 'Likes, comments and follow activity' },
  { href: '/search',   icon: Compass,     label: 'Explore',  desc: 'Discover people and content' },
  { href: '/reels',    icon: Play,        label: 'Reels',    desc: 'Full-screen short videos' },
  { href: '/verify',   icon: ShieldCheck, label: 'Verify',   desc: 'Get the trusted badge on your profile' },
];

const CREATE = [
  { href: '/upload', icon: ImageIcon, label: 'Post',  hint: 'Share a photo' },
  { href: '/upload', icon: Film,      label: 'Reel',  hint: 'Share a video' },
];

const FOOTER_LINKS = [
  { href: '/about',    label: 'About' },
  { href: '/help',     label: 'Help' },
  { href: '/press',    label: 'Press' },
  { href: '/careers',  label: 'Careers' },
  { href: '/privacy',  label: 'Privacy' },
  { href: '/terms',    label: 'Terms' },
  { href: '/settings', label: 'Language' },
  { href: '/verify',   label: 'NXQ Verified' },
  { href: '/pages',    label: 'My Pages' },
  { href: '/contact',  label: 'Contact' },
];

export function MenuPanel({ onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (href: string) => { onClose(); router.push(href); };

  const handleLogout = () => { onClose(); logout(); router.push('/login'); };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center sm:justify-start">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:max-w-3xl bg-gray-50 sm:m-4 sm:rounded-3xl shadow-2xl max-h-[100dvh] sm:max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-gray-50/95 backdrop-blur border-b border-gray-100">
          <h2 className="text-2xl font-black text-gray-900">Menu</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors"
            aria-label="Close menu"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Shortcuts (2 cols on desktop) ──────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-4">

            {/* Profile card */}
            {user && (
              <button
                onClick={() => go(`/profile/${user.username}`)}
                className="flex items-center gap-3 p-4 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-md transition-all text-left"
              >
                <Avatar src={user.avatarUrl} alt={user.username} size="lg" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-900 truncate">{user.displayName}</span>
                    <TrustBadge status={user.verificationStatus} size="sm" />
                  </div>
                  <span className="text-sm text-gray-500 truncate block">@{user.username}</span>
                  <span className="text-xs text-purple-600 font-semibold">View your profile</span>
                </div>
              </button>
            )}

            <SectionLabel>Shortcuts</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-2">
              {SHORTCUTS.map(({ href, icon: Icon, label, desc }) => (
                <button
                  key={label}
                  onClick={() => go(href)}
                  className="group flex items-start gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-md transition-all text-left"
                >
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 text-purple-600 group-hover:from-purple-600 group-hover:to-fuchsia-600 group-hover:text-white transition-colors shrink-0">
                    <Icon size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400 leading-snug">{desc}</p>
                  </div>
                </button>
              ))}

              {/* Call entry, gated by flag/role */}
              {callsVisible(user?.role) && (
                <button
                  onClick={() => go('/call/new')}
                  className="group flex items-start gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-md transition-all text-left"
                >
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 text-purple-600 group-hover:from-purple-600 group-hover:to-fuchsia-600 group-hover:text-white transition-colors shrink-0">
                    <Phone size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">Call</p>
                    <p className="text-xs text-gray-400 leading-snug">Start a voice or video call</p>
                  </div>
                </button>
              )}

              {/* Live entry, gated by flag/role */}
              {liveVisible(user?.role) && (
                <button
                  onClick={() => go('/live/new')}
                  className="group flex items-start gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-rose-200 hover:shadow-md transition-all text-left"
                >
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-rose-100 to-red-100 text-rose-600 group-hover:from-rose-600 group-hover:to-red-600 group-hover:text-white transition-colors shrink-0">
                    <Radio size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900">Live</p>
                    <p className="text-xs text-gray-400 leading-snug">Broadcast live to your followers</p>
                  </div>
                </button>
              )}
            </div>

            <SectionLabel>Pages</SectionLabel>
            <button
              onClick={() => go('/pages')}
              className="group flex items-center gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-md transition-all text-left"
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 text-purple-600 group-hover:from-purple-600 group-hover:to-fuchsia-600 group-hover:text-white transition-colors shrink-0">
                <BookOpen size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900">My Pages</p>
                <p className="text-xs text-gray-400 leading-snug">Manage your brands and public pages</p>
              </div>
            </button>

            {/* Admin */}
            {(user?.role === 'ADMIN' || user?.role === 'MODERATOR') && (
              <>
                <SectionLabel>Moderation</SectionLabel>
                <button
                  onClick={() => go('/admin')}
                  className="group flex items-center gap-3 p-3 rounded-2xl bg-amber-50 ring-1 ring-amber-100 hover:shadow-md transition-all text-left"
                >
                  <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-amber-500 text-white shrink-0">
                    <ShieldAlert size={20} />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-amber-800">Moderation</p>
                    <p className="text-xs text-amber-600">Review reports and manage users</p>
                  </div>
                </button>
              </>
            )}

            {/* Account */}
            <SectionLabel>Account</SectionLabel>
            <div className="grid sm:grid-cols-2 gap-2">
              <button
                onClick={() => go(`/feedback?from=${encodeURIComponent(pathname)}`)}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-md transition-all text-left"
              >
                <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-600 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                  <MessageSquare size={20} />
                </span>
                <p className="text-sm font-bold text-gray-900">Feedback</p>
              </button>
              <button
                onClick={() => go('/settings')}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-purple-200 hover:shadow-md transition-all text-left"
              >
                <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-600 group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                  <Settings size={20} />
                </span>
                <p className="text-sm font-bold text-gray-900">Settings</p>
              </button>
              <button
                onClick={handleLogout}
                className="group flex items-center gap-3 p-3 rounded-2xl bg-white ring-1 ring-gray-100 hover:ring-red-200 hover:shadow-md transition-all text-left"
              >
                <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-gray-100 text-gray-600 group-hover:bg-red-500 group-hover:text-white transition-colors shrink-0">
                  <LogOut size={20} />
                </span>
                <p className="text-sm font-bold text-gray-900">Log out</p>
              </button>
            </div>
          </div>

          {/* ── Create column ──────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="p-4 rounded-3xl bg-white ring-1 ring-gray-100 shadow-sm">
              <h3 className="text-lg font-black text-gray-900 mb-3">Create</h3>
              <div className="flex flex-col gap-1.5">
                {CREATE.map(({ href, icon: Icon, label, hint }) => (
                  <button
                    key={label}
                    onClick={() => go(href)}
                    className="group flex items-center gap-3 p-2.5 rounded-2xl hover:bg-purple-50 transition-colors text-left"
                  >
                    <span className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shrink-0">
                      <Icon size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{hint}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white shadow-md">
              <p className="text-sm font-bold mb-1">NXQ Social</p>
              <p className="text-xs text-white/80 leading-relaxed">
                A trust-first social network. Verify your profile to earn the badge and grow your reach.
              </p>
            </div>
          </div>
        </div>

        {/* ── Footer links ───────────────────────────────────────────── */}
        <div className="px-5 pb-6 pt-2 border-t border-gray-100">
          <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-gray-400 font-medium">
            {FOOTER_LINKS.map(({ href, label }) => (
              <button
                key={label}
                onClick={() => go(href)}
                className="hover:text-purple-600 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3 tracking-wide">
            © {new Date().getFullYear()} NXQ SOCIAL
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">{children}</h3>;
}
