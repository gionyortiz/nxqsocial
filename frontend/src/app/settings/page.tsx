'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Lock, Bell, ShieldOff, LogOut, Trash2, ChevronRight,
  Loader2, CheckCircle2, ArrowLeft, Eye, EyeOff,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Avatar } from '@/components/ui/Avatar';
import { ProfileEditModal } from '@/components/profile/ProfileEditModal';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface BlockedUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, updateUser, logout } = useAuthStore();

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

  // Blocked users
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [blockedLoaded, setBlockedLoaded] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  // Delete account
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get('/users/me/settings')
      .then(({ data }) => { setEmailNotifications(data.emailNotifications); })
      .catch(() => {})
      .finally(() => setNotifLoaded(true));
  }, []);

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
    if (newPassword.length < 8) { setPwError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setPwError('New passwords do not match.'); return; }
    setPwSaving(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setPwDone(true);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setTimeout(() => { setPwOpen(false); setPwDone(false); }, 1800);
    } catch (err: any) {
      setPwError(err.response?.data?.message ?? 'Could not change password. Please try again.');
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

  const handleProfileSaved = (updates: any) => {
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

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-black text-gray-900">Settings</h1>
        </div>

        {/* Account card */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 ring-1 ring-purple-100 mb-6">
          <Avatar src={user.avatarUrl} alt={user.username} size="lg" />
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{user.displayName}</p>
            <p className="text-sm text-gray-500 truncate">@{user.username}</p>
          </div>
        </div>

        {/* ── Account ──────────────────────────────────────────────── */}
        <SectionTitle>Account</SectionTitle>
        <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
          <Row icon={<User size={18} />} label="Edit profile" desc="Name, bio, photo, banner" onClick={() => setEditOpen(true)} />
          <Divider />
          <Row icon={<Lock size={18} />} label="Change password" desc="Update your password" onClick={() => { setPwOpen(true); setPwError(''); setPwDone(false); }} />
        </div>

        {/* ── Notifications ────────────────────────────────────────── */}
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
        </div>

        {/* ── Privacy ──────────────────────────────────────────────── */}
        <SectionTitle>Privacy</SectionTitle>
        <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-6 shadow-sm">
          <Row icon={<ShieldOff size={18} />} label="Blocked accounts" desc="Manage people you've blocked" onClick={openBlocked} />
        </div>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <SectionTitle>Account actions</SectionTitle>
        <div className="rounded-2xl ring-1 ring-gray-100 bg-white overflow-hidden mb-10 shadow-sm">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors text-left"
          >
            <span className="text-gray-500"><LogOut size={18} /></span>
            <span className="text-sm font-semibold text-gray-900">Log out</span>
          </button>
          <Divider />
          <button
            onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); }}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 transition-colors text-left"
          >
            <span className="text-red-500"><Trash2 size={18} /></span>
            <div>
              <p className="text-sm font-semibold text-red-600">Delete account</p>
              <p className="text-xs text-gray-400">Permanently remove your account and data</p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Edit profile modal ─────────────────────────────────────── */}
      {editOpen && (
        <ProfileEditModal
          profile={user as any}
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
