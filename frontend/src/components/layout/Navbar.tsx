'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Play, PlusSquare, User, Search, LogOut, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/feed',   icon: Home,        label: 'Home' },
  { href: '/search', icon: Search,      label: 'Search' },
  { href: '/reels',  icon: Play,        label: 'Reels' },
  { href: '/upload', icon: PlusSquare,  label: 'Upload' },
  { href: '/verify', icon: ShieldCheck, label: 'Verify' },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 px-3 py-6 gap-1 z-40">

        {/* Logo */}
        <Link href="/feed" className="mb-6 px-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shadow-sm flex-shrink-0">
            <span className="text-white text-xs font-black">NXQ</span>
          </div>
          <span className="text-xl font-black bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent tracking-tight">
            NXQ Social
          </span>
        </Link>

        {/* Nav items */}
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                active
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-200'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}

        {/* Bottom section */}
        <div className="mt-auto flex flex-col gap-1">

          {/* Moderation — admin/mod only */}
          {(user?.role === 'ADMIN' || user?.role === 'MODERATOR') && (
            <>
              <div className="h-px bg-gray-100 mx-2 mb-1" />
              <Link
                href="/admin"
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all',
                  pathname === '/admin'
                    ? 'bg-amber-500 text-white shadow-sm'
                    : 'text-amber-700 bg-amber-50 hover:bg-amber-100',
                )}
              >
                <ShieldAlert size={20} strokeWidth={2} />
                Moderation
              </Link>
            </>
          )}

          {/* Profile card */}
          {user && (
            <>
              <div className="h-px bg-gray-100 mx-2 my-1" />
              <Link
                href={`/profile/${user.username}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all',
                  pathname.startsWith('/profile')
                    ? 'bg-purple-50 ring-1 ring-purple-100'
                    : 'hover:bg-gray-50',
                )}
              >
                <Avatar src={user.avatarUrl} alt={user.username} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-gray-900 truncate">{user.displayName}</span>
                    <TrustBadge status={user.verificationStatus} size="sm" />
                  </div>
                  <span className="text-xs text-gray-400 truncate block">@{user.username}</span>
                </div>
              </Link>
            </>
          )}

          {/* Log out */}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={20} />
            Log out
          </button>
        </div>
      </nav>

      {/* ── Mobile bottom bar ────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-40 flex">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-semibold transition-colors',
                active ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              <div className={cn('p-1 rounded-lg', active ? 'bg-purple-100' : '')}>
                <Icon size={21} strokeWidth={active ? 2.5 : 2} />
              </div>
              {label}
            </Link>
          );
        })}
        {user && (
          <Link
            href={`/profile/${user.username}`}
            className={cn(
              'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-semibold transition-colors',
              pathname.startsWith('/profile') ? 'text-purple-600' : 'text-gray-400',
            )}
          >
            <div className={cn('p-1 rounded-lg', pathname.startsWith('/profile') ? 'bg-purple-100' : '')}>
              <User size={21} strokeWidth={pathname.startsWith('/profile') ? 2.5 : 2} />
            </div>
            Profile
          </Link>
        )}
      </nav>
    </>
  );
}
