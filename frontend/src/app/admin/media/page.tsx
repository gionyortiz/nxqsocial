'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  XCircle,
  Trash2,
  AlertTriangle,
  Clock,
  Film,
  ImageIcon,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type UploadStatus = 'PENDING' | 'SCANNING' | 'PUBLISHED' | 'REJECTED';
type ModerationStatus = 'PENDING' | 'APPROVED' | 'FLAGGED' | 'REJECTED' | 'REMOVED';
type FilterTab = 'FLAGGED' | 'SCANNING' | 'REJECTED' | 'ALL';

interface SafetyLabel {
  name: string;
  confidence: number;
  parentName?: string;
}

interface SafetyResult {
  safe: boolean;
  labels?: SafetyLabel[];
  maxConfidence?: number;
  topCategory?: string;
  adminRejectionReason?: string | null;
  provider?: string;
}

interface MediaItem {
  id: string;
  url: string | null;
  mimeType: string;
  size: number;
  uploadStatus: UploadStatus;
  moderationStatus: ModerationStatus;
  safetyResult: SafetyResult | null;
  safetyJobId: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string;
    trustScore: number;
    verificationStatus: string;
  };
  post: {
    id: string;
    caption: string | null;
    status: string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  UNVERIFIED: 'text-red-400',
  BASIC: 'text-gray-400',
  HUMAN_VERIFIED: 'text-blue-400',
  ID_VERIFIED: 'text-yellow-400',
  BUSINESS_VERIFIED: 'text-purple-400',
};

function TrustChip({ score }: { score: number }) {
  const color =
    score >= 80
      ? 'bg-green-700'
      : score >= 60
      ? 'bg-blue-700'
      : score >= 40
      ? 'bg-yellow-700'
      : 'bg-red-700';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold text-white ${color}`}>
      {score}
    </span>
  );
}

function ModerationBadge({ status }: { status: ModerationStatus | UploadStatus }) {
  const map: Record<string, string> = {
    FLAGGED: 'bg-amber-900 text-amber-300',
    REJECTED: 'bg-red-900 text-red-300',
    REMOVED: 'bg-gray-800 text-gray-400',
    SCANNING: 'bg-blue-900 text-blue-300',
    APPROVED: 'bg-green-900 text-green-300',
    PUBLISHED: 'bg-green-900 text-green-300',
    PENDING: 'bg-gray-800 text-gray-400',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${map[status] ?? 'bg-gray-800 text-gray-400'}`}>
      {status}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminMediaPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [filter, setFilter] = useState<FilterTab>('FLAGGED');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Redirect non-admins
  useEffect(() => {
    if (user && user.role !== 'ADMIN') router.replace('/feed');
  }, [user, router]);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError('');
      try {
        const params: Record<string, string> = { status: filter };
        if (cursor) params.cursor = cursor;
        const { data } = await api.get<{ items: MediaItem[]; nextCursor: string | null }>(
          '/admin/media',
          { params },
        );
        setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
        setNextCursor(data.nextCursor);
      } catch {
        setError('Failed to load media');
      } finally {
        setLoading(false);
      }
    },
    [filter],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  const act = useCallback(
    async (id: string, action: 'approve' | 'reject' | 'remove', reason?: string) => {
      setActionLoading((prev) => ({ ...prev, [id]: true }));
      try {
        if (action === 'approve') {
          await api.patch(`/admin/media/${id}/approve`);
        } else if (action === 'reject') {
          await api.patch(`/admin/media/${id}/reject`, { reason });
        } else {
          await api.delete(`/admin/media/${id}`);
        }
        setItems((prev) => prev.filter((item) => item.id !== id));
      } catch {
        setError(`Failed to ${action} media`);
      } finally {
        setActionLoading((prev) => ({ ...prev, [id]: false }));
      }
    },
    [],
  );

  if (!user || user.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ── */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/admin')}
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
          >
            Admin
          </button>
          <ChevronRight size={14} className="text-gray-600" />
          <span className="font-semibold">Media Review</span>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* ── Filter tabs ── */}
        <div className="flex gap-1 bg-gray-900 rounded-xl p-1 w-fit">
          {(['FLAGGED', 'SCANNING', 'REJECTED', 'ALL'] as FilterTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === tab
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab === 'FLAGGED' && '🚩 '}
              {tab === 'SCANNING' && '🔍 '}
              {tab === 'REJECTED' && '🚫 '}
              {tab}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle size={15} /> {error}
          </div>
        )}

        {/* ── Item count ── */}
        {!loading && items.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            No items to review in this category.
          </div>
        )}

        {/* ── Media grid ── */}
        <div className="space-y-4">
          {items.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              isExpanded={expanded === item.id}
              onToggle={() => setExpanded((prev) => (prev === item.id ? null : item.id))}
              onApprove={() => act(item.id, 'approve')}
              onReject={(reason) => act(item.id, 'reject', reason)}
              onRemove={() => act(item.id, 'remove')}
              loading={!!actionLoading[item.id]}
            />
          ))}
        </div>

        {/* ── Load more ── */}
        {nextCursor && (
          <div className="flex justify-center">
            <button
              onClick={() => load(nextCursor)}
              disabled={loading}
              className="px-6 py-2 rounded-xl bg-gray-800 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MediaCard ─────────────────────────────────────────────────────────────────

function MediaCard({
  item,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  onRemove,
  loading,
}: {
  item: MediaItem;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onReject: (reason?: string) => void;
  onRemove: () => void;
  loading: boolean;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const isVideo = item.mimeType.startsWith('video/');
  const safetyLabels = item.safetyResult?.labels ?? [];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="flex gap-4 p-4">
        {/* ── Thumbnail ── */}
        <div className="w-28 h-28 flex-shrink-0 rounded-xl overflow-hidden bg-gray-800 flex items-center justify-center">
          {item.url ? (
            isVideo ? (
              <video
                src={item.url}
                className="w-full h-full object-cover"
                muted
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt="media"
                className="w-full h-full object-cover"
              />
            )
          ) : (
            <div className="text-gray-600">
              {isVideo ? <Film size={32} /> : <ImageIcon size={32} />}
            </div>
          )}
        </div>

        {/* ── Info ── */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <ModerationBadge status={item.moderationStatus} />
              <ModerationBadge status={item.uploadStatus} />
              {isVideo ? (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Film size={11} /> Video
                </span>
              ) : (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <ImageIcon size={11} /> Image
                </span>
              )}
              <span className="text-xs text-gray-500">{formatBytes(item.size)}</span>
            </div>
            <span className="text-xs text-gray-600 whitespace-nowrap">
              {new Date(item.createdAt).toLocaleDateString()}
            </span>
          </div>

          {/* Uploader */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">@{item.user.username}</span>
            <span className={`text-xs ${TIER_COLORS[item.user.verificationStatus] ?? 'text-gray-500'}`}>
              {item.user.verificationStatus.replace('_', ' ')}
            </span>
            <TrustChip score={item.user.trustScore} />
          </div>

          {/* Post caption */}
          {item.post && (
            <p className="text-xs text-gray-500 truncate">
              Post: {item.post.caption ?? '(no caption)'}
              {' · '}
              <span className="text-gray-600">{item.post.status}</span>
            </p>
          )}

          {/* Safety labels preview */}
          {safetyLabels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {safetyLabels.slice(0, 4).map((label, i) => (
                <span
                  key={i}
                  className="text-xs bg-amber-900/60 text-amber-300 rounded px-2 py-0.5"
                >
                  {label.name} {label.confidence?.toFixed(0)}%
                </span>
              ))}
              {safetyLabels.length > 4 && (
                <button
                  onClick={onToggle}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  +{safetyLabels.length - 4} more
                </button>
              )}
            </div>
          )}

          {item.safetyResult?.adminRejectionReason && (
            <p className="text-xs text-red-400">
              Rejection reason: {item.safetyResult.adminRejectionReason}
            </p>
          )}

          {item.uploadStatus === 'SCANNING' && (
            <div className="flex items-center gap-1 text-xs text-blue-400">
              <Clock size={12} className="animate-pulse" /> Awaiting scan result
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          {item.moderationStatus !== 'APPROVED' && item.uploadStatus !== 'REJECTED' && (
            <button
              onClick={onApprove}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-800/50 text-green-300 hover:bg-green-700/60 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <CheckCircle size={13} /> Approve
            </button>
          )}
          {item.moderationStatus !== 'REJECTED' && (
            <button
              onClick={() => setShowRejectInput((v) => !v)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/50 text-red-300 hover:bg-red-800/60 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <XCircle size={13} /> Reject
            </button>
          )}
          {item.moderationStatus !== 'REMOVED' && (
            <button
              onClick={onRemove}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              <Trash2 size={13} /> Remove
            </button>
          )}
          <button
            onClick={onToggle}
            className="text-xs text-gray-600 hover:text-gray-400 text-right"
          >
            {isExpanded ? 'Less' : 'Details'}
          </button>
        </div>
      </div>

      {/* ── Reject reason input ── */}
      {showRejectInput && (
        <div className="px-4 pb-3 flex gap-2 border-t border-gray-800 pt-3">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Rejection reason (optional)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-red-600"
          />
          <button
            onClick={() => {
              onReject(rejectReason || undefined);
              setShowRejectInput(false);
            }}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-red-800 text-red-100 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Confirm Reject
          </button>
          <button
            onClick={() => setShowRejectInput(false)}
            className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Expanded: full safety result ── */}
      {isExpanded && (
        <div className="border-t border-gray-800 px-4 py-3 bg-gray-900/50">
          <p className="text-xs text-gray-500 font-medium mb-2 uppercase tracking-wide">
            Full Safety Report
          </p>
          {item.safetyResult ? (
            <div className="space-y-1.5">
              <div className="flex gap-4 text-xs">
                <span className="text-gray-500">Provider:</span>
                <span className="text-gray-300">{item.safetyResult.provider ?? 'unknown'}</span>
                <span className="text-gray-500">Safe:</span>
                <span className={item.safetyResult.safe ? 'text-green-400' : 'text-red-400'}>
                  {item.safetyResult.safe ? 'Yes' : 'No'}
                </span>
                {item.safetyResult.maxConfidence != null && (
                  <>
                    <span className="text-gray-500">Max confidence:</span>
                    <span className="text-gray-300">
                      {item.safetyResult.maxConfidence.toFixed(1)}%
                    </span>
                  </>
                )}
              </div>
              {safetyLabels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {safetyLabels.map((label, i) => (
                    <span
                      key={i}
                      className="text-xs bg-amber-900/40 text-amber-300 rounded px-2 py-0.5"
                    >
                      {label.parentName ? `${label.parentName} › ` : ''}
                      {label.name} — {label.confidence?.toFixed(1)}%
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No safety scan data available.</p>
          )}

          {item.safetyJobId && (
            <p className="text-xs text-gray-600 mt-2">
              Rekognition job: <code className="text-gray-500">{item.safetyJobId}</code>
            </p>
          )}
          <p className="text-xs text-gray-700 mt-1 font-mono">ID: {item.id}</p>
        </div>
      )}
    </div>
  );
}
