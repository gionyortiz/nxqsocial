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
import { api } from '@/lib/api';
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

const DEFAULT_BADGES: Record<string, number> = {};
const SEEN_KEY = 'nxq_nav_seen';

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
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('nxq_nav_compact') : null;
    if (saved === '1') setCompact(true);
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SEEN_KEY) : null;
      if (raw) setSeen(JSON.parse(raw));
    } catch {}
  }, []);

  // Mark a badged path as seen the moment the user opens it.
  useEffect(() => {
    if (!pathname) return;
    if (DEFAULT_BADGES[pathname] && !seen[pathname]) {
      const next = { ...seen, [pathname]: true };
      setSeen(next);
      try { window.localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
    }
  }, [pathname, seen]);

  const badgeFor = (href: string) => {
    if (href === '/notifications') return unreadNotifs;
    return seen[href] ? 0 : (DEFAULT_BADGES[href] ?? 0);
  };

  // Poll the real unread notification count while signed in.
  useEffect(() => {
    if (!user) return;
    let active = true;
    const fetchUnread = async () => {
      try {
        const { data } = await api.get('/notifications/unread-count');
        if (active) setUnreadNotifs(data?.count ?? 0);
      } catch {
        /* ignore */
      }
    };
    fetchUnread();
    const id = setInterval(fetchUnread, 30000);
    return () => { active = false; clearInterval(id); };
  }, [user]);

  // Clear the badge as soon as the user opens the notifications page.
  useEffect(() => {
    if (pathname === '/notifications') setUnreadNotifs(0);
  }, [pathname]);

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
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-64 bg-white/80 dark:bg-[#111827]/80 backdrop-blur-xl border-r border-white/60 dark:border-white/[0.06] px-3 py-6 gap-1 z-40 shadow-[var(--shadow-sm)]">

        {/* Logo */}
        <div className="mb-5 px-2.5 flex items-center justify-between">
          <Link href="/feed" className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-purple-600 to-fuchsia-500 flex items-center justify-center shadow-[var(--shadow-brand)] flex-shrink-0">
              <Logo size={22} className="text-white" />
            </div>
            {!compact && (
              <span className="text-[22px] font-black gradient-text tracking-tight truncate">
                NXQ Social
              </span>
            )}
          </Link>
          <button
            onClick={toggleCompact}
            className="hidden xl:flex items-center justify-center w-8 h-8 rounded-xl text-gray-400 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
            title={compact ? 'Expand sidebar' : 'Compact sidebar'}
          >
            <ChevronsLeftRight size={15} />
          </button>
        </div>

        {/* Primary nav */}
        <div className="flex flex-col gap-0.5">
          {NAV.map(({ href, icon: Icon, tkey }) => {
            const active = isActive(href);
            const label = t(tkey);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[15px] font-semibold transition-all duration-150',
                  active
                    ? 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[var(--shadow-brand)]'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-white/[0.05] hover:text-purple-700 dark:hover:text-purple-300',
                )}
                title={compact ? label : undefined}
              >
                <span className={cn(
                  'flex items-center justify-center w-9 h-9 rounded-xl transition-all flex-shrink-0',
                  active ? 'bg-white/20' : 'bg-gray-100/80 dark:bg-white/[0.06] group-hover:bg-white/80 dark:group-hover:bg-white/10',
                )}>
                  <Icon size={19} strokeWidth={active ? 2.5 : 2} />
                </span>
                {!compact && <span className="flex-1 truncate">{label}</span>}
                {!compact && badgeFor(href) ? (
                  <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-bounce-in">
                    {badgeFor(href) > 9 ? '9+' : badgeFor(href)}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {/* Call — Beta feature */}
          {callsVisible(user?.role) && (
            <Link
              href="/call/new"
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[15px] font-semibold transition-all duration-150',
                isActive('/call')
                  ? 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow-[var(--shadow-brand)]'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-purple-50 dark:hover:bg-white/[0.05] hover:text-purple-700',
              )}
              title={compact ? 'Call' : undefined}
            >
              <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl transition-all flex-shrink-0', isActive('/call') ? 'bg-white/20' : 'bg-gray-100/80 dark:bg-white/[0.06] group-hover:bg-white/80')}>
                <Phone size={19} strokeWidth={isActive('/call') ? 2.5 : 2} />
              </span>
              {!compact && <span className="flex-1">Call</span>}
              {!compact && <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[10px] font-bold uppercase tracking-wide">Beta</span>}
            </Link>
          )}

          {/* Live — Beta feature */}
          {liveVisible(user?.role) && (
            <Link
              href="/live/new"
              className={cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-2xl text-[15px] font-semibold transition-all duration-150',
                isActive('/live')
                  ? 'bg-gradient-to-r from-rose-600 to-orange-500 text-white shadow-lg shadow-rose-200'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-rose-50 dark:hover:bg-white/[0.05] hover:text-rose-600',
              )}
              title={compact ? 'Live' : undefined}
            >
              <span className={cn('flex items-center justify-center w-9 h-9 rounded-xl transition-all flex-shrink-0', isActive('/live') ? 'bg-white/20' : 'bg-gray-100/80 dark:bg-white/[0.06] group-hover:bg-white/80')}>
                <Radio size={19} strokeWidth={isActive('/live') ? 2.5 : 2} />
              </span>
              {!compact && <span className="flex-1">Live</span>}
              {!compact && <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-live-blink inline-block" />LIVE</span>}
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
      <nav className="md:hidden fixed bottom-4 left-4 right-4 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="bg-white/85 dark:bg-[#111827]/90 backdrop-blur-2xl rounded-[28px] shadow-[var(--shadow-float)] border border-white/70 dark:border-white/10 flex items-stretch px-1 py-1">
        {MOBILE_NAV.map(({ href, icon: Icon, tkey }) => {
          const active = isActive(href);
          const label = t(tkey);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-bold transition-all rounded-[22px]',
                active ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500',
              )}
            >
              <div className={cn(
                'p-2 rounded-2xl transition-all',
                active ? 'bg-gradient-to-br from-purple-600 to-fuchsia-500 text-white shadow-[var(--shadow-brand)]' : '',
              )}>
                <Icon size={21} strokeWidth={active ? 2.5 : 2} className={active ? 'text-white' : ''} />
              </div>
              <span className={active ? 'gradient-text' : ''}>{label}</span>
            </Link>
          );
        })}

        {/* Profile avatar tab */}
        {user && (
          <Link
            href={`/profile/${user.username}`}
            className={cn(
              'flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-bold transition-all rounded-[22px]',
              pathname.startsWith('/profile') ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500',
            )}
          >
            <div className={cn('p-0.5 rounded-full', pathname.startsWith('/profile') ? 'ring-verified' : 'ring-2 ring-transparent')}>
              <Avatar src={user.avatarUrl} alt={user.username} size="xs" />
            </div>
            {t('nav.profile')}
          </Link>
        )}

        {/* Menu tab */}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex-1 flex flex-col items-center py-2 gap-0.5 text-[10px] font-bold text-gray-400 dark:text-gray-500 hover:text-gray-600 transition-colors rounded-[22px]"
        >
          <div className="p-2 rounded-2xl">
            <MenuIcon size={21} strokeWidth={2} />
          </div>
          {t('nav.menu')}
        </button>
        </div>
      </nav>

      {/* ── Full menu panel ──────────────────────────────────────────────── */}
      {menuOpen && <MenuPanel onClose={() => setMenuOpen(false)} />}
    </>
  );
}
