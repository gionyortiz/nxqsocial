'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Play, PlusSquare, User, Search, LogOut, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Avatar } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/feed', icon: Home, label: 'Home' },
  { href: '/search', icon: Search, label: 'Search' },
  { href: '/reels', icon: Play, label: 'Reels' },
  { href: '/upload', icon: PlusSquare, label: 'Upload' },
  { href: '/verify', icon: ShieldCheck, label: 'Verify' },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 px-4 py-8 gap-2 z-40">
        <Link href="/feed" className="mb-6 px-4">
          <span className="text-2xl font-black bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">
            NXQ Social
          </span>
        </Link>

        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
              pathname === href
                ? 'bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700'
                : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <Icon size={22} />
            {label}
          </Link>
        ))}

        <div className="mt-auto flex flex-col gap-2">
          {user && (
            <Link
              href={`/profile/${user.username}`}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                pathname.startsWith('/profile') ? 'bg-purple-50 text-purple-700' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              <Avatar src={user.avatarUrl} alt={user.username} size="sm" />
              <span className="truncate">{user.displayName}</span>
            </Link>
          )}
          {(user?.role === 'ADMIN' || user?.role === 'MODERATOR') && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                pathname === '/admin' ? 'bg-red-50 text-red-700' : 'text-gray-600 hover:bg-red-50 hover:text-red-600',
              )}
            >
              <ShieldAlert size={22} />
              Moderation
            </Link>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={20} />
            Log out
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 flex">
        {NAV.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors',
              pathname === href ? 'text-purple-600' : 'text-gray-400',
            )}
          >
            <Icon size={22} />
            {label}
          </Link>
        ))}
        {user && (
          <Link
            href={`/profile/${user.username}`}
            className={cn(
              'flex-1 flex flex-col items-center py-3 gap-0.5 text-xs transition-colors',
              pathname.startsWith('/profile') ? 'text-purple-600' : 'text-gray-400',
            )}
          >
            <User size={22} />
            Profile
          </Link>
        )}
      </nav>
    </>
  );
}
