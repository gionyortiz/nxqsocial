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

type Tab = 'reports' | 'verifications' | 'safety' | 'audit' | 'users';

export default function AdminPage() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('reports');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'success' | 'error'>('success');

  const [reports, setReports] = useState<Report[]>([]);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [safetyFlags, setSafetyFlags] = useState<SafetyFlag[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
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
    } catch { showNotice('Failed to load data', 'error'); }
    finally { setLoading(false); }
  }, [showNotice]);

  useEffect(() => { if (isAdmin) load(tab); }, [tab, isAdmin, load]);

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
      <div className="border-b border-gray-800 bg-gray-900 px-6 py-4">
        <h1 className="text-xl font-bold">Moderation Dashboard</h1>
        <p className="text-sm text-gray-400">NXQ Social Admin &middot; {new Date().toLocaleDateString()}</p>
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
      </div>

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
