'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Lock, Bell, ShieldOff, LogOut, Trash2, ChevronRight,
  Loader2, CheckCircle2, ArrowLeft, Eye, EyeOff, Globe, Check,
  ShieldCheck, Calendar, Sparkles, ArrowRight, Pencil, UserCircle, AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { usePathname } from 'next/navigation';
import { Avatar } from '@/components/ui/Avatar';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useI18n, LANGUAGES } from '@/lib/i18n';

interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
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

function formatJoinDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** Frontend-derived profile completeness (0–100) and remaining steps. */
function computeCompleteness(u: {
  avatarUrl?: string; bannerUrl?: string; bio?: string;
  location?: string; website?: string; verificationStatus: string;
}) {
  const checks = [
    { label: 'Add a profile photo', done: !!u.avatarUrl },
    { label: 'Add a banner image', done: !!u.bannerUrl },
    { label: 'Write a bio', done: !!u.bio?.trim() },
    { label: 'Add your location', done: !!u.location?.trim() },
    { label: 'Add a website', done: !!u.website?.trim() },
    { label: 'Get verified', done: VERIFIED_STATUSES.includes(u.verificationStatus) },
  ];
  const done = checks.filter((c) => c.done).length;
  const percent = Math.round((done / checks.length) * 100);
  return { percent, checks, remaining: checks.filter((c) => !c.done) };
}

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, updateUser, logout } = useAuthStore();
  const { t, lang, setLang } = useI18n();

  const [editOpen, setEditOpen] = useState(false);

  // Change password
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwDone, setPwDone] = useState(false);

  // Notifications
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notifLoaded, setNotifLoaded] = useState(false);

  // Member since (real, from profile)
  const [memberSince, setMemberSince] = useState<string | null>(null);

  // Language
  const [langOpen, setLangOpen] = useState(false);

  // Blocked users
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [blockedLoaded, setBlockedLoaded] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const getApiMessage = (err: unknown): string | undefined => {
    return (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  };

  useEffect(() => {
    api.get('/users/me/settings')
      .then(({ data }) => { setEmailNotifications(data.emailNotifications); })
      .catch(() => {})
      .finally(() => setNotifLoaded(true));
  }, []);

  useEffect(() => {
    if (!user?.username) return;
    api.get(`/users/${user.username}`)
      .then(({ data }) => setMemberSince(data.createdAt ?? null))
      .catch(() => {});
  }, [user?.username]);

  const chooseLanguage = (code: string) => {
    setLang(code as typeof lang);
    setLangOpen(false);
  };

  const toggleNotifications = async () => {
    const next = !emailNotifications;
    setEmailNotifications(next);
    try {
      await api.patch('/users/me/settings', { emailNotifications: next });
    } catch {
      setEmailNotifications(!next);
    }
  };

  const openBlocked = async () => {
    setBlockOpen(true);
    if (!blockedLoaded) {
      try {
        const { data } = await api.get('/users/me/blocked');
        setBlocked(data);
      } catch {
        // ignore
      } finally {
        setBlockedLoaded(true);
      }
    }
  };

  const unblock = async (username: string) => {
    setUnblocking(username);
    try {
      await api.delete(`/users/${username}/block`);
      setBlocked((prev) => prev.filter((b) => b.username !== username));
    } catch {
      // ignore
    } finally {
      setUnblocking(null);
    }
  };

  const handleChangePassword = async () => {
    setPwError('');
    if (newPassword.length < 12) { setPwError('New password must be at least 12 characters.'); return; }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      setPwError('Include an uppercase letter, a lowercase letter, a number, and a special character.'); return;
    }
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match.'); return; }
    setPwSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setPwDone(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => { setPwOpen(false); setPwDone(false); }, 1800);
    } catch (err: unknown) {
      setPwError(getApiMessage(err) ?? 'Could not change password. Please try again.');
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete('/users/me');
      logout();
      router.push('/');
    } catch {
      setDeleting(false);
    }
  };

  const handleProfileSaved = (updates: Parameters<typeof updateUser>[0]) => {
    updateUser(updates);
  };

  if (!user) {
    return (
      <AppShell>
        <div className="flex justify-center pt-20">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  const isVerified = VERIFIED_STATUSES.includes(user.verificationStatus);
  const completeness = computeCompleteness(user);

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-black text-gray-900">{t('settings.title')}</h1>
        </div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">

          {/* ═══ LEFT: settings sections ═══════════════════════════════ */}
          <div>
            {/* ── Account ─────────────────────────────────────────── */}
            <SectionTitle>Account</SectionTitle>
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
              <Row icon={<User size={18} />} label="Edit profile" desc="Name, bio, photo, banner" onClick={() => setEditOpen(true)} />
              <Divider />
              <Row icon={<UserCircle size={18} />} label="View your profile" desc={`@${user.username}`} onClick={() => router.push(`/profile/${user.username}`)} />
              <Divider />
              <Row icon={<Lock size={18} />} label="Change password" desc="Update your password" onClick={() => { setPwOpen(true); setPwError(''); setPwDone(false); }} />
              {!isVerified && (
                <>
                  <Divider />
                  <Row icon={<ShieldCheck size={18} />} label="Verify your account" desc="Boost trust and unlock the verified badge" onClick={() => router.push('/verify')} />
                </>
              )}
            </div>

            {/* ── Notifications ───────────────────────────────────── */}
            <SectionTitle>Notifications</SectionTitle>
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="text-purple-600"><Bell size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Email notifications</p>
                  <p className="text-xs text-gray-400">Get emails about activity and security</p>
                </div>
                <button
                  onClick={toggleNotifications}
                  disabled={!notifLoaded}
                  className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${emailNotifications ? 'bg-purple-600' : 'bg-gray-300'}`}
                  aria-label="Toggle email notifications"
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${emailNotifications ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              <Divider />
              <ComingSoonRow label="Security alerts" desc="Sign-ins and password changes" />
              <Divider />
              <ComingSoonRow label="Follower notifications" desc="When someone follows you" />
              <Divider />
              <ComingSoonRow label="Comment notifications" desc="Replies and mentions on your posts" />
            </div>

            {/* ── Privacy ─────────────────────────────────────────── */}
            <SectionTitle>{t('settings.privacy')}</SectionTitle>
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
              <Row icon={<ShieldOff size={18} />} label={t('settings.blocked')} desc="Manage people you've blocked" onClick={openBlocked} />
            </div>

            {/* ── Language ────────────────────────────────────────── */}
            <SectionTitle>{t('settings.language')}</SectionTitle>
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
              <Row
                icon={<Globe size={18} />}
                label={t('settings.language')}
                desc={LANGUAGES.find((l) => l.code === lang)?.native ?? 'English'}
                onClick={() => setLangOpen(true)}
              />
              <Divider />
              <Row
                icon={<MessageSquare size={18} />}
                label="Feedback"
                desc="Tell us what broke or what to improve"
                onClick={() => router.push(`/feedback?from=${encodeURIComponent(pathname)}`)}
              />
            </div>

            {/* ── Session ─────────────────────────────────────────── */}
            <SectionTitle>Session</SectionTitle>
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
              >
                <span className="text-gray-500"><LogOut size={18} /></span>
                <span className="text-sm font-semibold text-gray-900">{t('settings.logout')}</span>
              </button>
            </div>

            {/* ── Danger zone ─────────────────────────────────────── */}
            <SectionTitle><span className="text-red-400">Danger zone</span></SectionTitle>
            <div className="rounded-2xl ring-1 ring-red-200 bg-red-50/40 overflow-hidden mb-10">
              <div className="flex items-center gap-2 px-4 pt-4 pb-2">
                <AlertTriangle size={15} className="text-red-500" />
                <p className="text-xs font-bold text-red-500 uppercase tracking-wider">Irreversible actions</p>
              </div>
              <button
                onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-100/50 transition-colors text-left"
              >
                <span className="text-red-500"><Trash2 size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-red-600">{t('settings.deleteAccount')}</p>
                  <p className="text-xs text-red-400/80">Permanently remove your account and data</p>
                </div>
                <ChevronRight size={18} className="text-red-300" />
              </button>
            </div>
          </div>

          {/* ═══ RIGHT: account & trust summary ════════════════════════ */}
          <aside className="lg:sticky lg:top-6 space-y-4">

            {/* Account card */}
            <div className="rounded-2xl ring-1 ring-purple-100 bg-gradient-to-br from-purple-50 to-pink-50 p-4">
              <div className="flex items-center gap-3">
                <Avatar src={user.avatarUrl} alt={user.username} size="lg" />
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate flex items-center gap-1">
                    {user.displayName}
                    {isVerified && <ShieldCheck size={15} className="text-purple-600 shrink-0" />}
                  </p>
                  <p className="text-sm text-gray-500 truncate">@{user.username}</p>
                </div>
              </div>
              <button
                onClick={() => setEditOpen(true)}
                className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/70 ring-1 ring-purple-100 text-sm font-semibold text-purple-700 hover:bg-white transition-colors"
              >
                <Pencil size={13} /> Edit profile
              </button>
            </div>

            {/* Profile completeness */}
            {completeness.percent < 100 && (
              <div className="rounded-2xl ring-1 ring-purple-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-purple-500" /> Complete your profile
                  </span>
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

            {/* Trust + verification + member-since cards */}
            <div className="space-y-3">
              {/* Trust score */}
              <div className="rounded-2xl ring-1 ring-emerald-100 bg-gradient-to-b from-emerald-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Trust Score</span>
                </div>
                <div className="text-2xl font-black text-gray-900 leading-none">{user.trustScore}<span className="text-sm font-semibold text-gray-400">/100</span></div>
                <div className="mt-2.5 h-1.5 rounded-full bg-emerald-100 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${Math.min(100, user.trustScore)}%` }} />
                </div>
              </div>

              {/* Verification */}
              <div className="rounded-2xl ring-1 ring-purple-100 bg-gradient-to-b from-purple-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <ShieldCheck size={14} className={isVerified ? 'text-purple-500' : 'text-gray-300'} />
                  <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Verification</span>
                </div>
                <div className="text-base font-black text-gray-900 leading-tight">{verificationLabel(user.verificationStatus)}</div>
                {!isVerified && (
                  <button onClick={() => router.push('/verify')} className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-purple-600 hover:text-purple-700">
                    Get verified <ArrowRight size={12} />
                  </button>
                )}
              </div>

              {/* Member since */}
              <div className="rounded-2xl ring-1 ring-gray-100 bg-gradient-to-b from-gray-50 to-white p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Calendar size={14} className="text-gray-400" />
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Member Since</span>
                </div>
                <div className="text-base font-black text-gray-900 leading-tight">{formatJoinDate(memberSince)}</div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden shadow-sm">
              <QuickAction icon={<Pencil size={15} />} label="Edit profile" onClick={() => setEditOpen(true)} />
              <Divider />
              <QuickAction icon={<UserCircle size={15} />} label="Go to profile" onClick={() => router.push(`/profile/${user.username}`)} />
              <Divider />
              <QuickAction icon={<ShieldCheck size={15} />} label="Verify account" onClick={() => router.push('/verify')} />
              <Divider />
              <QuickAction icon={<Lock size={15} />} label="Security & password" onClick={() => { setPwOpen(true); setPwError(''); setPwDone(false); }} />
            </div>
          </aside>
        </div>
      </div>

      {/* ── Edit profile modal ─────────────────────────────────────── */}
      {editOpen && (
        <ProfileEditModal
          profile={user}
          onClose={() => setEditOpen(false)}
          onSaved={handleProfileSaved}
        />
      )}

      {/* ── Change password modal ──────────────────────────────────── */}
      {pwOpen && (
        <Modal onClose={() => !pwSaving && setPwOpen(false)} title="Change password">
          {pwDone ? (
            <div className="flex flex-col items-center text-center py-6">
              <CheckCircle2 size={44} className="text-green-500 mb-3" />
              <p className="font-bold text-gray-900">Password changed</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <PwField label="Current password" value={currentPassword} onChange={setCurrentPassword} show={showPw} />
              <PwField label="New password" value={newPassword} onChange={setNewPassword} show={showPw} />
              <PwField label="Confirm new password" value={confirmPassword} onChange={setConfirmPassword} show={showPw} />
              <button onClick={() => setShowPw((s) => !s)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 self-start">
                {showPw ? <EyeOff size={13} /> : <Eye size={13} />} {showPw ? 'Hide' : 'Show'} passwords
              </button>
              {pwError && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{pwError}</div>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setPwOpen(false)} disabled={pwSaving} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button onClick={handleChangePassword} disabled={pwSaving} className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2">
                  {pwSaving && <Loader2 size={15} className="animate-spin" />}{pwSaving ? 'Saving…' : 'Update'}
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ── Blocked accounts modal ─────────────────────────────────── */}
      {blockOpen && (
        <Modal onClose={() => setBlockOpen(false)} title="Blocked accounts">
          {!blockedLoaded ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-purple-500" /></div>
          ) : blocked.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">You haven&apos;t blocked anyone.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {blocked.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                  <Avatar src={b.avatarUrl} alt={b.username} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{b.displayName}</p>
                    <p className="text-xs text-gray-500 truncate">@{b.username}</p>
                  </div>
                  <button
                    onClick={() => unblock(b.username)}
                    disabled={unblocking === b.username}
                    className="px-3 py-1.5 rounded-full border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {unblocking === b.username ? 'Unblocking…' : 'Unblock'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ── Language modal ─────────────────────────────────────────── */}
      {langOpen && (
        <Modal onClose={() => setLangOpen(false)} title={t('settings.chooseLanguage')}>
          <div className="flex flex-col gap-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => chooseLanguage(l.code)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-purple-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{l.native}</p>
                  <p className="text-xs text-gray-400">{l.label}</p>
                </div>
                {lang === l.code && <Check size={18} className="text-purple-600" />}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* ── Delete account modal ───────────────────────────────────── */}
      {deleteOpen && (
        <Modal onClose={() => !deleting && setDeleteOpen(false)} title="Delete account">
          <div className="flex flex-col gap-4">
            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <Trash2 size={24} className="text-red-500" />
            </div>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              This permanently deletes your account, posts, and all data. This cannot be undone.
              Type <span className="font-bold text-gray-900">DELETE</span> to confirm.
            </p>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-3">
              <button onClick={() => setDeleteOpen(false)} disabled={deleting} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== 'DELETE'}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={15} className="animate-spin" />}{deleting ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{children}</h2>;
}

function Divider() {
  return <div className="h-px bg-gray-100 mx-4" />;
}

function Row({ icon, label, desc, onClick }: { icon: React.ReactNode; label: string; desc?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left">
      <span className="text-purple-600">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        {desc && <p className="text-xs text-gray-400">{desc}</p>}
      </div>
      <ChevronRight size={18} className="text-gray-300" />
    </button>
  );
}

function ComingSoonRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 opacity-70">
      <span className="text-gray-400"><Bell size={18} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Soon</span>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left">
      <span className="text-purple-600">{icon}</span>
      <span className="flex-1 text-sm font-semibold text-gray-900">{label}</span>
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function PwField({ label, value, onChange, show }: { label: string; value: string; onChange: (v: string) => void; show: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
        placeholder="••••••••"
      />
    </div>
  );
}
