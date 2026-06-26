'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Report {
  id: string;
  reason: string;
  description?: string;
  status: string;
  createdAt: string;
  reporter: { id: string; username: string };
  reported?: { id: string; username: string; trustScore: number; verificationStatus: string };
  post?: { id: string; caption?: string };
}

interface Verification {
  id: string;
  level: string;
  provider: string;
  status: string;
  createdAt: string;
  user: { id: string; username: string; verificationStatus: string };
}

interface AuditLog {
  id: string;
  actionType: string;
  targetUserId?: string;
  targetPostId?: string;
  reason?: string;
  meta?: Record<string, unknown>;
  createdAt: string;
  admin: { id: string; username: string };
}

interface SafetyFlag {
  id: string;
  entityType: string;
  entityId: string;
  flagType: string;
  detail?: string;
  resolvedAt?: string;
  createdAt: string;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  verificationStatus: string;
  trustScore: number;
  emailVerified: boolean;
  phoneVerified: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  createdAt: string;
  displayName?: string;
  _count: { posts: number; reportsReceived: number };
}

interface TrustHistoryData {
  user: AdminUser & { _count: { reportsReceived: number; posts: number; followers: number } };
  reports: Report[];
  auditLogs: AuditLog[];
  verifications: Verification[];
}

interface AnalyticsDashboard {
  kpis: {
    dau: number;
    mau: number;
    newRegistrations: number;
    postsCreated: number;
    reelsCreated: number;
    callsStarted: number;
    callsCompleted: number;
    liveSessionsStarted: number;
    liveViewersJoined: number;
    verificationRequests: number;
    reportsSubmitted: number;
  };
}

interface BetaFeedbackItem {
  id: string;
  type: string;
  severity: string;
  route: string;
  deviceType: string;
  browser: string;
  description: string;
  screenshotUrl?: string;
  status: 'OPEN' | 'TRIAGED' | 'IN_PROGRESS' | 'RESOLVED' | 'WONT_FIX';
  createdAt: string;
  user: {
    id: string;
    username: string;
    email: string;
    profile?: {
      displayName: string;
    };
  };
}

interface BetaFeedbackStats {
  open: number;
  blocking: number;
  high: number;
  resolved: number;
}

interface PasswordResetHistoryEntry {
  createdAt: string;
  usedAt?: string | null;
  expiresAt: string;
}

interface AccountRecoveryAuditLog {
  createdAt: string;
  actionType: string;
  reason?: string;
  admin?: { username?: string };
  meta?: { action?: string };
}

interface AccountRecoveryDetail extends AdminUser {
  phone?: string;
  registrationMethod?: string;
  signupSource?: string;
  passwordResetHistory?: PasswordResetHistoryEntry[];
  auditLog?: AccountRecoveryAuditLog[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = {
  SPAM: 'Spam', SCAM: 'Scam', FAKE_ACCOUNT: 'Fake Account',
  HARASSMENT: 'Harassment', HATE_SPEECH: 'Hate Speech', VIOLENCE: 'Violence',
  NUDITY: 'Nudity', MISINFORMATION: 'Misinformation', DEEPFAKE: 'Deepfake', OTHER: 'Other',
};

const TIER_COLORS: Record<string, string> = {
  UNVERIFIED: 'text-red-400', BASIC: 'text-gray-400',
  HUMAN_VERIFIED: 'text-blue-400', ID_VERIFIED: 'text-yellow-400',
  BUSINESS_VERIFIED: 'text-purple-400',
};

const FLAG_COLORS: Record<string, string> = {
  phishing: 'bg-red-900 text-red-300',
  crypto_scam: 'bg-orange-900 text-orange-300',
  fake_giveaway: 'bg-yellow-900 text-yellow-300',
  spam_link: 'bg-pink-900 text-pink-300',
  suspicious_url: 'bg-purple-900 text-purple-300',
  urgency_manipulation: 'bg-amber-900 text-amber-300',
};

const AUDIT_LABELS: Record<string, string> = {
  REPORT_ACTION_TAKEN: 'Report Actioned',
  REPORT_DISMISSED: 'Report Dismissed',
  VERIFICATION_APPROVED: 'Verification Approved',
  VERIFICATION_REJECTED: 'Verification Rejected',
  USER_BANNED: 'User Banned',
  USER_SUSPENDED: 'User Suspended',
  POST_REMOVED: 'Post Removed',
  SAFETY_FLAG_CREATED: 'Safety Flag',
  TRUST_SCORE_OVERRIDE: 'Trust Override',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function TrustChip({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-green-700' : score >= 60 ? 'bg-blue-700' : score >= 40 ? 'bg-yellow-700' : 'bg-red-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold text-white ${color}`}>
      {score}
    </span>
  );
}

function StatusBadge({ suspended, banned }: { suspended: boolean; banned: boolean }) {
  if (banned) return <span className="rounded bg-red-900 px-2 py-0.5 text-xs font-bold text-red-300">BANNED</span>;
  if (suspended) return <span className="rounded bg-orange-900 px-2 py-0.5 text-xs font-bold text-orange-300">SUSPENDED</span>;
  return <span className="rounded bg-green-900 px-2 py-0.5 text-xs font-bold text-green-300">ACTIVE</span>;
}

function TabBtn({ active, onClick, children, badge }: {
  active: boolean; onClick: () => void;
  children: React.ReactNode; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-white'
      }`}
    >
      {children}
      {badge != null && badge > 0 && (
        <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-xs">{badge}</span>
      )}
    </button>
  );
}

// ── Trust History Modal ───────────────────────────────────────────────────────

function TrustHistoryModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<TrustHistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/users/admin/${userId}/trust-history`)
      .then((r) => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Trust History</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        </div>

        {loading && <p className="text-gray-400">Loading…</p>}
        {data && (
          <div className="space-y-6">
            {/* User summary */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg font-bold">@{data.user.username}</span>
                <TrustChip score={data.user.trustScore} />
                <span className={`text-xs ${TIER_COLORS[data.user.verificationStatus]}`}>
                  {data.user.verificationStatus.replace('_', ' ')}
                </span>
                <StatusBadge suspended={data.user.isSuspended} banned={data.user.isBanned} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-gray-400">
                <div><div className="text-white font-bold text-xl">{data.user._count.posts}</div>Posts</div>
                <div><div className="text-white font-bold text-xl">{data.user._count.followers}</div>Followers</div>
                <div><div className={`font-bold text-xl ${data.user._count.reportsReceived > 0 ? 'text-red-400' : 'text-white'}`}>{data.user._count.reportsReceived}</div>Reports</div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span>Email {data.user.emailVerified ? '✓ verified' : '✗ unverified'}</span>
                <span>Phone {data.user.phoneVerified ? '✓ verified' : '✗ unverified'}</span>
                <span>Joined {new Date(data.user.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Reports */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Reports received ({data.reports.length})</h3>
              {data.reports.length === 0 ? (
                <p className="text-xs text-gray-500">None</p>
              ) : (
                <div className="space-y-1">
                  {data.reports.map((r) => (
                    <div key={r.id} className="flex items-center justify-between rounded bg-gray-800 px-3 py-2 text-xs">
                      <span className="text-gray-200">{REASON_LABELS[r.reason] ?? r.reason}</span>
                      <span className={r.status === 'ACTION_TAKEN' ? 'text-red-400' : r.status === 'PENDING' ? 'text-yellow-400' : 'text-gray-500'}>
                        {r.status}
                      </span>
                      <span className="text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Audit logs */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Moderation actions ({data.auditLogs.length})</h3>
              {data.auditLogs.length === 0 ? (
                <p className="text-xs text-gray-500">None</p>
              ) : (
                <div className="space-y-1">
                  {data.auditLogs.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded bg-gray-800 px-3 py-2 text-xs">
                      <span className="text-gray-200">{AUDIT_LABELS[a.actionType] ?? a.actionType}</span>
                      <span className="text-gray-400">by @{a.admin.username}</span>
                      <span className="text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Verifications */}
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-300">Verification history ({data.verifications.length})</h3>
              {data.verifications.length === 0 ? (
                <p className="text-xs text-gray-500">None</p>
              ) : (
                <div className="space-y-1">
                  {data.verifications.map((v) => (
                    <div key={v.id} className="flex items-center justify-between rounded bg-gray-800 px-3 py-2 text-xs">
                      <span className={`font-medium ${TIER_COLORS[v.level]}`}>{v.level.replace('_', ' ')}</span>
                      <span className="text-gray-400">{v.provider}</span>
                      <span className={v.status === 'APPROVED' ? 'text-green-400' : v.status === 'REJECTED' ? 'text-red-400' : 'text-yellow-400'}>
                        {v.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'reports' | 'verifications' | 'safety' | 'audit' | 'users' | 'feedback' | 'recovery';

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const initialUserFromQuery =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('user')
      : null;
  const [tab, setTab] = useState<Tab>(initialUserFromQuery ? 'recovery' : 'reports');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error'>('success');

  const [initialRecoveryUser] = useState<string | null>(initialUserFromQuery);

  const [reports, setReports] = useState<Report[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [safetyFlags, setSafetyFlags] = useState<SafetyFlag[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [betaFeedback, setBetaFeedback] = useState<BetaFeedbackItem[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<BetaFeedbackStats | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [historyUserId, setHistoryUserId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR';

  useEffect(() => {
    if (!user) { router.replace('/login'); return; }
    if (!isAdmin) { router.replace('/feed'); return; }
  }, [user, isAdmin, router]);

  const showNotice = useCallback((msg: string, type: 'success' | 'error' = 'success') => {
    setNotice(msg); setNoticeType(type);
    setTimeout(() => setNotice(''), 4000);
  }, []);

  const load = useCallback(async (t: Tab) => {
    setLoading(true);
    try {
      if (t === 'reports') { const { data } = await api.get('/reports/admin/pending'); setReports(data); }
      else if (t === 'verifications') { const { data } = await api.get('/verification/admin/pending'); setVerifications(data); }
      else if (t === 'safety') { const { data } = await api.get('/safety/flags'); setSafetyFlags(data); }
      else if (t === 'audit') { const { data } = await api.get('/audit/logs'); setAuditLogs(data); }
      else if (t === 'users') { const { data } = await api.get('/users/admin/list'); setAdminUsers(data.data); }
      else if (t === 'feedback') {
        const [{ data: list }, { data: stats }] = await Promise.all([
          api.get('/feedback/admin?take=120'),
          api.get('/feedback/admin/stats'),
        ]);
        setBetaFeedback(list);
        setFeedbackStats(stats);
      }
    } catch { showNotice('Failed to load data', 'error'); }
    finally { setLoading(false); }
  }, [showNotice]);

  useEffect(() => {
    if (!isAdmin) return;
    const id = window.setTimeout(() => {
      void load(tab);
    }, 0);
    return () => window.clearTimeout(id);
  }, [tab, isAdmin, load]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/analytics/admin/dashboard?days=30').then(({ data }) => {
      setDashboard(data);
    }).catch(() => {
      setDashboard(null);
    });
  }, [isAdmin]);

  async function resolveReport(id: string, action: 'ACTION_TAKEN' | 'DISMISSED') {
    try {
      await api.patch(`/reports/admin/${id}/resolve`, { resolution: action });
      showNotice(action === 'ACTION_TAKEN' ? 'Report actioned' : 'Report dismissed');
      setReports((p) => p.filter((r) => r.id !== id));
    } catch { showNotice('Failed', 'error'); }
  }

  async function reviewVerification(id: string, approved: boolean) {
    try {
      await api.patch(`/verification/admin/${id}/review`, { approved: String(approved) });
      showNotice(approved ? 'Verification approved' : 'Verification rejected');
      setVerifications((p) => p.filter((v) => v.id !== id));
    } catch { showNotice('Failed', 'error'); }
  }

  async function resolveFlag(id: string) {
    try {
      await api.patch(`/safety/flags/${id}/resolve`);
      showNotice('Flag resolved');
      setSafetyFlags((p) => p.filter((f) => f.id !== id));
    } catch { showNotice('Failed', 'error'); }
  }

  async function userAction(userId: string, action: 'suspend' | 'restore' | 'ban') {
    try {
      await api.post(`/users/admin/${userId}/${action}`, { reason: actionReason || undefined });
      showNotice(`User ${action}${action === 'ban' ? 'ned' : 'ed'}`);
      setActionReason('');
      load('users');
    } catch { showNotice('Failed', 'error'); }
  }

  async function updateFeedbackStatus(id: string, status: BetaFeedbackItem['status']) {
    try {
      await api.patch(`/feedback/admin/${id}/status`, { status });
      setBetaFeedback((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
      const { data } = await api.get('/feedback/admin/stats');
      setFeedbackStats(data);
      showNotice('Feedback status updated');
    } catch {
      showNotice('Failed', 'error');
    }
  }

  async function searchUsers() {
    setLoading(true);
    try {
      const { data } = await api.get(`/users/admin/list?search=${encodeURIComponent(userSearch)}`);
      setAdminUsers(data.data);
    } finally { setLoading(false); }
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/feed')}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-800"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Back to Feed
        </button>
        <div>
          <h1 className="text-xl font-bold">Moderation Dashboard</h1>
          <p className="text-sm text-gray-400">NXQ Social Admin &middot; {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {notice && (
        <div className={`px-6 py-2 text-sm font-medium ${noticeType === 'error' ? 'bg-red-700' : 'bg-green-700'}`}>
          {notice}
        </div>
      )}

      {dashboard?.kpis && (
        <div className="px-6 pt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <KpiCard label="DAU" value={dashboard.kpis.dau} />
          <KpiCard label="MAU" value={dashboard.kpis.mau} />
          <KpiCard label="Registrations" value={dashboard.kpis.newRegistrations} />
          <KpiCard label="Posts" value={dashboard.kpis.postsCreated} />
          <KpiCard label="Reels" value={dashboard.kpis.reelsCreated} />
          <KpiCard label="Calls Started" value={dashboard.kpis.callsStarted} />
          <KpiCard label="Calls Completed" value={dashboard.kpis.callsCompleted} />
          <KpiCard label="Live Started" value={dashboard.kpis.liveSessionsStarted} />
          <KpiCard label="Live Joined" value={dashboard.kpis.liveViewersJoined} />
          <KpiCard label="Verification Requests" value={dashboard.kpis.verificationRequests} />
          <KpiCard label="Reports Submitted" value={dashboard.kpis.reportsSubmitted} />
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-800 overflow-x-auto px-6">
        <div className="flex gap-6 min-w-max">
          <TabBtn active={tab === 'reports'} onClick={() => setTab('reports')} badge={reports.length}>Pending Reports</TabBtn>
          <TabBtn active={tab === 'verifications'} onClick={() => setTab('verifications')} badge={verifications.length}>Verification Queue</TabBtn>
          <TabBtn active={tab === 'safety'} onClick={() => setTab('safety')} badge={safetyFlags.length}>Safety Flags</TabBtn>
          <TabBtn active={tab === 'audit'} onClick={() => setTab('audit')}>Audit Log</TabBtn>
          <TabBtn active={tab === 'users'} onClick={() => setTab('users')}>User Management</TabBtn>
          <TabBtn active={tab === 'feedback'} onClick={() => setTab('feedback')} badge={feedbackStats?.open ?? 0}>User Feedback</TabBtn>
          <TabBtn active={tab === 'recovery'} onClick={() => setTab('recovery')}>Account Recovery</TabBtn>
        </div>
      </div>

      <div className="p-6">
        {loading && <p className="py-4 text-gray-400">Loading&hellip;</p>}

        {/* Reports */}
        {tab === 'reports' && !loading && (
          reports.length === 0 ? <p className="text-gray-500">No pending reports.</p> : (
            <div className="space-y-4">
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-gray-700 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="rounded bg-red-900 px-2 py-0.5 text-xs font-bold text-red-300">{REASON_LABELS[r.reason] ?? r.reason}</span>
                        <span className="text-xs text-gray-400">by <span className="text-white">@{r.reporter.username}</span></span>
                        <span className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                      {r.description && <p className="text-sm text-gray-300 italic">&ldquo;{r.description}&rdquo;</p>}
                      {r.reported && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-400">User:</span>
                          <button onClick={() => setHistoryUserId(r.reported!.id)} className="text-sm font-medium text-blue-400 hover:underline">
                            @{r.reported.username}
                          </button>
                          <TrustChip score={r.reported.trustScore} />
                          <span className={`text-xs ${TIER_COLORS[r.reported.verificationStatus]}`}>{r.reported.verificationStatus.replace('_', ' ')}</span>
                        </div>
                      )}
                      {r.post && <p className="text-xs text-gray-400">Post: {r.post.caption?.slice(0, 80) ?? '(no caption)'}</p>}
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button onClick={() => resolveReport(r.id, 'ACTION_TAKEN')} className="rounded bg-red-700 px-3 py-1 text-xs font-bold hover:bg-red-600">Take Action</button>
                      <button onClick={() => resolveReport(r.id, 'DISMISSED')} className="rounded bg-gray-700 px-3 py-1 text-xs font-bold hover:bg-gray-600">Dismiss</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Verifications */}
        {tab === 'verifications' && !loading && (
          verifications.length === 0 ? <p className="text-gray-500">No pending verification requests.</p> : (
            <div className="space-y-4">
              {verifications.map((v) => (
                <div key={v.id} className="rounded-xl border border-gray-700 bg-gray-900 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">@{v.user.username}</span>
                        <span className={`text-xs ${TIER_COLORS[v.user.verificationStatus]}`}>{v.user.verificationStatus.replace('_', ' ')}</span>
                      </div>
                      <div className="flex gap-2 text-xs text-gray-400">
                        <span>Requesting: <span className={`font-bold ${TIER_COLORS[v.level]}`}>{v.level.replace('_', ' ')}</span></span>
                        <span>&middot; {v.provider}</span>
                        <span>&middot; {new Date(v.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewVerification(v.id, true)} className="rounded bg-green-700 px-3 py-1 text-xs font-bold hover:bg-green-600">Approve</button>
                      <button onClick={() => reviewVerification(v.id, false)} className="rounded bg-gray-700 px-3 py-1 text-xs font-bold hover:bg-gray-600">Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Safety Flags */}
        {tab === 'safety' && !loading && (
          safetyFlags.length === 0 ? <p className="text-gray-500">No unresolved safety flags.</p> : (
            <div className="space-y-3">
              {safetyFlags.map((f) => (
                <div key={f.id} className="rounded-xl border border-gray-700 bg-gray-900 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className={`rounded px-2 py-0.5 text-xs font-bold ${FLAG_COLORS[f.flagType] ?? 'bg-gray-700 text-gray-300'}`}>{f.flagType.replace('_', ' ')}</span>
                        <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{f.entityType}</span>
                        <span className="text-xs text-gray-500">{new Date(f.createdAt).toLocaleDateString()}</span>
                      </div>
                      {f.detail && <p className="text-xs text-gray-300 font-mono break-all">{f.detail.slice(0, 120)}</p>}
                      <p className="text-xs text-gray-500">ID: {f.entityId}</p>
                    </div>
                    <button onClick={() => resolveFlag(f.id)} className="shrink-0 rounded bg-green-800 px-3 py-1 text-xs font-bold hover:bg-green-700">Resolve</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Audit Log */}
        {tab === 'audit' && !loading && (
          auditLogs.length === 0 ? <p className="text-gray-500">No audit log entries.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700 text-left text-gray-400">
                    <th className="pb-2 pr-4 font-medium">Action</th>
                    <th className="pb-2 pr-4 font-medium">Admin</th>
                    <th className="pb-2 pr-4 font-medium">Target</th>
                    <th className="pb-2 pr-4 font-medium">Reason</th>
                    <th className="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {auditLogs.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-blue-900 px-2 py-0.5 text-blue-200">{AUDIT_LABELS[a.actionType] ?? a.actionType}</span>
                      </td>
                      <td className="py-2 pr-4 text-gray-300">@{a.admin.username}</td>
                      <td className="py-2 pr-4">
                        {a.targetUserId
                          ? <button onClick={() => setHistoryUserId(a.targetUserId!)} className="text-blue-400 hover:underline">{a.targetUserId.slice(0, 8)}&hellip;</button>
                          : <span className="text-gray-500">&mdash;</span>}
                      </td>
                      <td className="py-2 pr-4 text-gray-400">{a.reason ?? '—'}</td>
                      <td className="py-2 text-gray-500">{new Date(a.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* User Management */}
        {tab === 'users' && !loading && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                placeholder="Search username or email…"
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
              <button onClick={searchUsers} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600">Search</button>
            </div>
            <input
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="Action reason (optional, applied to next action)…"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
            />
            {adminUsers.length === 0 ? <p className="text-gray-500">No users found.</p> : (
              <div className="space-y-3">
                {adminUsers.map((u) => (
                  <div key={u.id} className="rounded-xl border border-gray-700 bg-gray-900 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap gap-2 items-center">
                          <button onClick={() => setHistoryUserId(u.id)} className="font-semibold text-blue-400 hover:underline">
                            @{u.username}
                          </button>
                          <TrustChip score={u.trustScore} />
                          <span className={`text-xs ${TIER_COLORS[u.verificationStatus]}`}>{u.verificationStatus.replace('_', ' ')}</span>
                          <StatusBadge suspended={u.isSuspended} banned={u.isBanned} />
                        </div>
                        <p className="text-xs text-gray-400">{u.email}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                          <span>{u._count.posts} posts</span>
                          <span className={u._count.reportsReceived > 0 ? 'text-red-400' : ''}>{u._count.reportsReceived} reports</span>
                          <span>Email {u.emailVerified ? '✓' : '✗'}</span>
                          <span>Phone {u.phoneVerified ? '✓' : '✗'}</span>
                          <span>Joined {new Date(u.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button onClick={() => setHistoryUserId(u.id)} className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600">History</button>
                        {!u.isSuspended && !u.isBanned && (
                          <button onClick={() => userAction(u.id, 'suspend')} className="rounded bg-orange-800 px-2 py-1 text-xs hover:bg-orange-700">Suspend</button>
                        )}
                        {(u.isSuspended || u.isBanned) && (
                          <button onClick={() => userAction(u.id, 'restore')} className="rounded bg-green-800 px-2 py-1 text-xs hover:bg-green-700">Restore</button>
                        )}
                        {!u.isBanned && (
                          <button
                            onClick={() => { if (window.confirm(`Permanently ban @${u.username}?`)) userAction(u.id, 'ban'); }}
                            className="rounded bg-red-900 px-2 py-1 text-xs hover:bg-red-800"
                          >Ban</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'feedback' && !loading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Open" value={feedbackStats?.open ?? 0} />
              <KpiCard label="Blocking" value={feedbackStats?.blocking ?? 0} />
              <KpiCard label="High" value={feedbackStats?.high ?? 0} />
              <KpiCard label="Resolved" value={feedbackStats?.resolved ?? 0} />
            </div>

            {betaFeedback.length === 0 ? (
              <p className="text-gray-500">No feedback yet.</p>
            ) : (
              <div className="space-y-3">
                {betaFeedback.map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-700 bg-gray-900 p-4">
                    <div className="flex flex-wrap gap-2 items-center mb-2">
                      <span className="rounded bg-indigo-900 px-2 py-0.5 text-xs font-bold text-indigo-200">{item.type.replaceAll('_', ' ')}</span>
                      <span className={`rounded px-2 py-0.5 text-xs font-bold ${item.severity === 'BLOCKING' ? 'bg-red-900 text-red-200' : item.severity === 'HIGH' ? 'bg-orange-900 text-orange-200' : item.severity === 'MEDIUM' ? 'bg-yellow-900 text-yellow-200' : 'bg-gray-700 text-gray-200'}`}>
                        {item.severity}
                      </span>
                      <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300">{item.deviceType}</span>
                      <span className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</span>
                    </div>

                    <p className="text-sm text-gray-200 mb-2">{item.description}</p>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 text-xs text-gray-400 mb-3">
                      <div>user: <span className="text-gray-200">@{item.user.username}</span></div>
                      <div>route: <span className="text-gray-200">{item.route}</span></div>
                      <div className="truncate">device: <span className="text-gray-200">{item.deviceType}</span></div>
                      <div className="truncate">browser: <span className="text-gray-200">{item.browser}</span></div>
                    </div>

                    {item.screenshotUrl && (
                      <a href={item.screenshotUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline">
                        Screenshot URL
                      </a>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <label className="text-xs text-gray-400">Status</label>
                      <select
                        value={item.status}
                        onChange={(e) => updateFeedbackStatus(item.id, e.target.value as BetaFeedbackItem['status'])}
                        className="rounded border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="TRIAGED">TRIAGED</option>
                        <option value="IN_PROGRESS">IN_PROGRESS</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="WONT_FIX">WONT_FIX</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account Recovery tab rendered outside .p-6 to avoid double padding */}
      {tab === 'recovery' && <AccountRecoveryTab initialUser={initialRecoveryUser} />}

      {historyUserId && <TrustHistoryModal userId={historyUserId} onClose={() => setHistoryUserId(null)} />}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
      <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-extrabold text-white leading-tight mt-1">{value}</p>
    </div>
  );
}

// ── Account Recovery Tab ──────────────────────────────────────────────────────

function AccountRecoveryTab({ initialUser }: { initialUser?: string | null }) {
  const [search, setSearch] = useState(initialUser ?? '');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AccountRecoveryDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'ok' | 'err'>('ok');
  const [actionReason, setActionReason] = useState('');

  const showNotice = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setNotice(msg);
    setNoticeType(type);
    setTimeout(() => setNotice(''), 4000);
  }, []);

  const loadDetail = useCallback(async (userId: string) => {
    setDetailLoading(true);
    try {
      const { data } = await api.get(`/users/admin/${userId}/detail`);
      setSelected(data);
    } catch {
      showNotice('Could not load user detail', 'err');
    } finally {
      setDetailLoading(false);
    }
  }, [showNotice]);

  const doSearch = useCallback(async (q?: string) => {
    const term = q ?? search;
    if (!term.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get('/users/admin/list', { params: { search: term, take: 10 } });
      const list = data.data ?? [];
      setUsers(list);
      // If exactly one result, auto-load detail
      if (list.length === 1) void loadDetail(list[0].id);
    } catch {
      showNotice('Search failed', 'err');
    } finally {
      setLoading(false);
    }
  }, [search, loadDetail, showNotice]);

  // Auto-search when opened with a pre-filled username.
  useEffect(() => {
    if (!initialUser) return;
    const id = window.setTimeout(() => {
      void doSearch(initialUser);
    }, 0);
    return () => window.clearTimeout(id);
  }, [initialUser, doSearch]);

  const action = async (userId: string, endpoint: string, label: string) => {
    if (!window.confirm(`${label} for this user?`)) return;
    try {
      const { data } = await api.post(`/users/admin/${userId}/${endpoint}`, { reason: actionReason || undefined });
      showNotice(data.message ?? `${label} done.`, 'ok');
      if (selected?.id === userId) await loadDetail(userId);
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      showNotice(message ?? `${label} failed`, 'err');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-bold text-white mb-1">Account Recovery &amp; Support</h2>
        <p className="text-sm text-gray-400">Search for a user and take support actions. All actions are logged in the audit trail.</p>
      </div>

      {notice && (
        <div className={`rounded-lg px-4 py-2 text-sm font-semibold ${noticeType === 'err' ? 'bg-red-800 text-red-200' : 'bg-green-800 text-green-200'}`}>
          {notice}
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && doSearch()}
          placeholder="Search by username, email, display name…"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <button onClick={() => doSearch()} disabled={loading} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Results */}
      {users.length > 0 && !selected && (
        <div className="space-y-2">
          {users.map((u) => (
            <button
              key={u.id}
              onClick={() => loadDetail(u.id)}
              className="w-full text-left rounded-xl border border-gray-700 bg-gray-900 p-3 hover:border-blue-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-sm font-bold text-blue-400">@{u.username}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
                <div className="ml-auto flex gap-2 items-center">
                  <span className="text-xs text-gray-500">{u.verificationStatus}</span>
                  <StatusBadge suspended={u.isSuspended} banned={u.isBanned} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {detailLoading && <p className="text-gray-400 text-sm">Loading user details…</p>}

      {selected && !detailLoading && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white">@{selected.username}</h3>
            <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-gray-300">← Back to results</button>
          </div>

          {/* User info card */}
          <div className="rounded-xl border border-gray-700 bg-gray-900 p-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              { label: 'Email', value: selected.email },
              { label: 'Phone', value: selected.phone ?? '—' },
              { label: 'Registration Method', value: selected.registrationMethod ?? '—' },
              { label: 'Signup Source', value: selected.signupSource ?? '—' },
              { label: 'Display Name', value: selected.displayName ?? '—' },
              { label: 'Role', value: selected.role },
              { label: 'Trust Score', value: selected.trustScore },
              { label: 'Verification', value: selected.verificationStatus },
              { label: 'Email Verified', value: selected.emailVerified ? '✅ Yes' : '❌ No' },
              { label: 'Phone Verified', value: selected.phoneVerified ? '✅ Yes' : '❌ No' },
              { label: 'Status', value: selected.isBanned ? 'BANNED' : selected.isSuspended ? 'SUSPENDED' : 'ACTIVE' },
              { label: 'Joined', value: new Date(selected.createdAt).toLocaleDateString() },
              { label: 'Posts', value: selected._count?.posts ?? 0 },
              { label: 'Reports Received', value: selected._count?.reportsReceived ?? 0 },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className="text-white font-medium mt-0.5">{String(value)}</p>
              </div>
            ))}
          </div>

          {/* Action reason */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Action reason (optional, logged)</label>
            <input
              value={actionReason}
              onChange={(e) => setActionReason(e.target.value)}
              placeholder="e.g. User requested via support email"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-yellow-500 focus:outline-none"
            />
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <ActionButton
              label="Send Password Reset Email"
              desc="Sends secure link — admin never sees token"
              color="blue"
              onClick={() => action(selected.id, 'send-password-reset', 'Send password reset')}
            />
            <ActionButton
              label="Resend Email Verification"
              desc="Sends verification reminder to user's inbox"
              color="indigo"
              onClick={() => action(selected.id, 'resend-email-verification', 'Resend email verification')}
            />
            <ActionButton
              label="Force Logout"
              desc="Invalidates all active reset tokens"
              color="yellow"
              onClick={() => action(selected.id, 'force-logout', 'Force logout')}
            />
            {!selected.isSuspended ? (
              <ActionButton
                label="Lock Account"
                desc="Prevents login without deleting data"
                color="orange"
                onClick={() => action(selected.id, 'lock', 'Lock account')}
              />
            ) : (
              <ActionButton
                label="Unlock Account"
                desc="Re-enables login for this account"
                color="green"
                onClick={() => action(selected.id, 'unlock', 'Unlock account')}
              />
            )}
            {!selected.isSuspended && !selected.isBanned && (
              <ActionButton
                label="Suspend"
                desc="Temporary suspension"
                color="orange"
                onClick={() => action(selected.id, 'suspend', 'Suspend user')}
              />
            )}
            {(selected.isSuspended || selected.isBanned) && (
              <ActionButton
                label="Restore Account"
                desc="Remove suspension/ban"
                color="green"
                onClick={() => action(selected.id, 'restore', 'Restore account')}
              />
            )}
          </div>

          {/* Password reset history */}
          {(selected.passwordResetHistory?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-300 mb-2">Password Reset History (last 5)</h4>
              <div className="space-y-1">
                {(selected.passwordResetHistory ?? []).map((r: PasswordResetHistoryEntry, i: number) => (
                  <div key={i} className="text-xs text-gray-400 flex gap-4">
                    <span>Requested: {new Date(r.createdAt).toLocaleString()}</span>
                    <span>Used: {r.usedAt ? new Date(r.usedAt).toLocaleString() : '—'}</span>
                    <span>Expires: {new Date(r.expiresAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit log */}
          {(selected.auditLog?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-300 mb-2">Admin Action Log</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {(selected.auditLog ?? []).map((l: AccountRecoveryAuditLog, i: number) => (
                  <div key={i} className="text-xs text-gray-400 flex gap-3 py-1 border-b border-gray-800">
                    <span className="text-gray-500 shrink-0">{new Date(l.createdAt).toLocaleString()}</span>
                    <span className="text-yellow-400 shrink-0">@{l.admin?.username ?? 'system'}</span>
                    <span>{l.actionType}</span>
                    {l.reason && <span className="text-gray-500">— {l.reason}</span>}
                    {l.meta?.action && <span className="text-blue-400">({l.meta.action})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, desc, color, onClick }: {
  label: string; desc: string; color: string; onClick: () => void;
}) {
  const colors: Record<string, string> = {
    blue: 'border-blue-700 hover:bg-blue-900/40 text-blue-300',
    indigo: 'border-indigo-700 hover:bg-indigo-900/40 text-indigo-300',
    yellow: 'border-yellow-700 hover:bg-yellow-900/40 text-yellow-300',
    orange: 'border-orange-700 hover:bg-orange-900/40 text-orange-300',
    green: 'border-green-700 hover:bg-green-900/40 text-green-300',
    red: 'border-red-700 hover:bg-red-900/40 text-red-300',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-gray-900 p-3 text-left transition-colors ${colors[color] ?? colors.blue}`}
    >
      <p className="text-sm font-bold">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
    </button>
  );
}
