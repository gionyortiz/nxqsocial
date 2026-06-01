'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home, Compass, Play, PlusSquare, ShieldCheck,
  Settings, LogOut, ShieldAlert, Menu as MenuIcon, Phone, Radio, ChevronsLeftRight, MessageSquare,
  Bell,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { Avatar } from '@/components/ui/Avatar';
import { TrustBadge } from '@/components/ui/TrustBadge';
import Logo from '@/components/Logo';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { callsVisible } from '@/lib/calls';
import { liveVisible } from '@/lib/live';
import { MenuPanel } from './MenuPanel';

// Primary destinations — every link points to a real page.
// NOTE: the Call entry is intentionally hidden during beta until the
// calling feature is fully implemented and tested.
const NAV = [
  { href: '/feed',     icon: Home,        tkey: 'nav.home' },
  { href: '/messages', icon: MessageSquare, tkey: 'nav.messages' },
  { href: '/notifications', icon: Bell, tkey: 'nav.notifications' },
  { href: '/search',   icon: Compass,     tkey: 'nav.explore' },
  { href: '/reels',    icon: Play,        tkey: 'nav.reels' },
  { href: '/upload',   icon: PlusSquare,  tkey: 'nav.create' },
  { href: '/verify',   icon: ShieldCheck, tkey: 'nav.verify' },
];

const DESKTOP_BADGES: Record<string, number> = {
  '/messages': 3,
  '/notifications': 2,
};

// Items shown on the compact mobile bar (max 5 for thumb reach).
const MOBILE_NAV = [
  { href: '/feed',     icon: Home,        tkey: 'nav.home' },
  { href: '/search',   icon: Compass,     tkey: 'nav.explore' },
  { href: '/upload',   icon: PlusSquare,  tkey: 'nav.create' },
  { href: '/reels',    icon: Play,        tkey: 'nav.reels' },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('nxq_nav_compact') : null;
    if (saved === '1') setCompact(true);
  }, []);

  const toggleCompact = () => {
    setCompact((prev) => {
      const next = !prev;
      window.localStorage.setItem('nxq_nav_compact', next ? '1' : '0');
      return next;
    });
  };

  const isActive = (href: string) =>
    href === '/feed' ? pathname === '/feed' : pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-100 px-2.5 py-6 gap-1 z-40">

        {/* Logo */}
        <div className="mb-6 px-2.5 flex items-center justify-between">
          <Link href="/feed" className="flex items-center gap-2 min-w-0">
            <Logo size={34} />
            {!compact && (
              <span className="text-xl font-black bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent tracking-tight truncate">
                NXQ Social
              </span>
            )}
          </Link>
          <button
            onClick={toggleCompact}
            className="hidden xl:flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-purple-700 hover:bg-purple-50 transition-colors"
            title={compact ? 'Expand sidebar' : 'Compact sidebar'}
            aria-label={compact ? 'Expand sidebar' : 'Compact sidebar'}
          >
            <ChevronsLeftRight size={16} />
          </button>
        </div>

        {/* Primary nav */}
        <div className="flex flex-col gap-1">
          {NAV.map(({ href, icon: Icon, tkey }) => {
            const active = isActive(href);
            const label = t(tkey);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all',
                  active
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-200 ring-1 ring-purple-300/60'
                    : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700',
                )}
                title={compact ? label : undefined}
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
                    active ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-white',
                  )}
                >
                  <Icon size={20} strokeWidth={active ? 2.6 : 2} />
                </span>
                {!compact && label}
                {!compact && DESKTOP_BADGES[href] ? (
                  <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {DESKTOP_BADGES[href]}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {/* Call — Beta feature, gated by flag/role */}
          {callsVisible(user?.role) && (
            <Link
              href="/call/new"
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all',
                isActive('/call')
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-200 ring-1 ring-purple-300/60'
                  : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700',
              )}
              title={compact ? 'Call' : undefined}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
                  isActive('/call') ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-white',
                )}
              >
                <Phone size={20} strokeWidth={isActive('/call') ? 2.6 : 2} />
              </span>
              {!compact && <span className="flex-1">Call</span>}
              {!compact && <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wide">Beta</span>}
            </Link>
          )}

          {/* Live — Beta feature, gated by flag/role */}
          {liveVisible(user?.role) && (
            <Link
              href="/live/new"
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all',
                isActive('/live')
                  ? 'bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md shadow-rose-200 ring-1 ring-rose-300/60'
                  : 'text-gray-600 hover:bg-rose-50 hover:text-rose-700',
              )}
              title={compact ? 'Live' : undefined}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
                  isActive('/live') ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-white',
                )}
              >
                <Radio size={20} strokeWidth={isActive('/live') ? 2.6 : 2} />
              </span>
              {!compact && <span className="flex-1">Live</span>}
              {!compact && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold uppercase tracking-wide">Beta</span>}
            </Link>
          )}

          <Link
            href={`/feedback?from=${encodeURIComponent(pathname)}`}
            className={cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all',
              isActive('/feedback')
                ? 'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-md shadow-purple-200 ring-1 ring-purple-300/60'
                : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700',
            )}
            title={compact ? t('nav.feedback') : undefined}
          >
            <span
              className={cn(
                'flex items-center justify-center w-9 h-9 rounded-xl transition-colors',
                isActive('/feedback') ? 'bg-white/20' : 'bg-gray-50 group-hover:bg-white',
              )}
            >
              <MessageSquare size={20} strokeWidth={isActive('/feedback') ? 2.6 : 2} />
            </span>
            {!compact && t('nav.feedback')}
          </Link>

          {/* Menu button — opens the full panel */}
          <button
            onClick={() => setMenuOpen(true)}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold text-gray-600 hover:bg-purple-50 hover:text-purple-700 transition-all"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 group-hover:bg-white transition-colors">
              <MenuIcon size={20} strokeWidth={2} />
            </span>
            {!compact && t('nav.menu')}
          </button>
        </div>

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
                <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/40">
                  <ShieldAlert size={20} strokeWidth={2} />
                </span>
                {!compact && t('nav.moderation')}
              </Link>
            </>
          )}

          {/* Settings */}
          <Link
            href="/settings"
            className={cn(
              'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold transition-all',
              pathname === '/settings'
                ? 'bg-purple-50 text-purple-700 ring-1 ring-purple-100'
                : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700',
            )}
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 group-hover:bg-white">
              <Settings size={20} />
            </span>
            {!compact && t('nav.settings')}
          </Link>

          {/* Log out */}
          <button
            onClick={logout}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 group-hover:bg-white">
              <LogOut size={20} />
            </span>
            {!compact && t('nav.logout')}
          </button>

          {/* Profile card */}
          {user && !compact && (
            <>
              <div className="h-px bg-gray-100 mx-2 my-1" />
              <Link
                href={`/profile/${user.username}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all',
                  pathname.startsWith('/profile')
                    ? 'bg-gradient-to-r from-purple-50 to-fuchsia-50 ring-1 ring-purple-100'
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
        </div>
      </nav>

      {/* ── Mobile bottom bar ────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-100 z-40 flex items-stretch pb-[env(safe-area-inset-bottom)]">
        {MOBILE_NAV.map(({ href, icon: Icon, tkey }) => {
          const active = isActive(href);
          const label = t(tkey);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center py-2 gap-0.5 text-[11px] font-semibold transition-colors',
                active ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600',
              )}
            >
              <div className={cn('p-1.5 rounded-xl transition-colors', active ? 'bg-purple-100' : '')}>
                <Icon size={22} strokeWidth={active ? 2.6 : 2} />
              </div>
              {label}
            </Link>
          );
        })}

        {/* Profile avatar tab */}
        {user && (
          <Link
            href={`/profile/${user.username}`}
            className={cn(
              'flex-1 flex flex-col items-center py-2 gap-0.5 text-[11px] font-semibold transition-colors',
              pathname.startsWith('/profile') ? 'text-purple-600' : 'text-gray-400',
            )}
          >
            <div
              className={cn(
                'p-0.5 rounded-full transition-all',
                pathname.startsWith('/profile') ? 'ring-2 ring-purple-500' : 'ring-2 ring-transparent',
              )}
            >
              <Avatar src={user.avatarUrl} alt={user.username} size="xs" />
            </div>
            {t('nav.profile')}
          </Link>
        )}

        {/* Menu tab */}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex-1 flex flex-col items-center py-2 gap-0.5 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
        >
          <div className="p-1.5 rounded-xl">
            <MenuIcon size={22} strokeWidth={2} />
          </div>
          {t('nav.menu')}
        </button>
      </nav>

      {/* ── Full menu panel ──────────────────────────────────────────────── */}
      {menuOpen && <MenuPanel onClose={() => setMenuOpen(false)} />}
    </>
  );
}
