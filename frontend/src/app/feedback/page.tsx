'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { api } from '@/lib/api';

type FeedbackType =
  | 'BUG'
  | 'UI_PROBLEM'
  | 'UPLOAD_PROBLEM'
  | 'CALL_PROBLEM'
  | 'LIVE_PROBLEM'
  | 'VERIFICATION_PROBLEM'
  | 'SUGGESTION';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKING';
type DeviceType = 'MOBILE' | 'DESKTOP' | 'TABLET';

const TYPE_OPTIONS: { value: FeedbackType; label: string }[] = [
  { value: 'BUG', label: 'Bug' },
  { value: 'UI_PROBLEM', label: 'UI problem' },
  { value: 'UPLOAD_PROBLEM', label: 'Upload problem' },
  { value: 'CALL_PROBLEM', label: 'Call problem' },
  { value: 'LIVE_PROBLEM', label: 'Live problem' },
  { value: 'VERIFICATION_PROBLEM', label: 'Verification problem' },
  { value: 'SUGGESTION', label: 'Suggestion' },
];

const SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'BLOCKING', label: 'Blocking' },
];

function detectDevice(userAgent: string, width: number): DeviceType {
  const ua = userAgent.toLowerCase();
  if (/(ipad|tablet)/.test(ua)) return 'TABLET';
  if (/(mobi|android|iphone)/.test(ua)) return 'MOBILE';
  if (width > 0 && width < 900) return 'MOBILE';
  if (width >= 900 && width <= 1200) return 'TABLET';
  return 'DESKTOP';
}

export default function FeedbackPage() {
  const router = useRouter();
  const initialFrom =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('from') || '/feed'
      : '/feed';

  const [type, setType] = useState<FeedbackType>('BUG');
  const [severity, setSeverity] = useState<Severity>('MEDIUM');
  const [route, setRoute] = useState(initialFrom);
  const [deviceType, setDeviceType] = useState<DeviceType>(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'DESKTOP';
    return detectDevice(navigator.userAgent, window.innerWidth);
  });
  const [browser, setBrowser] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 400) : '',
  );
  const [description, setDescription] = useState('');
  const [screenshotUrl, setScreenshotUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!description.trim()) {
      setError('Please describe what happened.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/feedback', {
        type,
        severity,
        route,
        deviceType,
        browser,
        description: description.trim(),
        screenshotUrl: screenshotUrl.trim() || undefined,
      });
      setDescription('');
      setScreenshotUrl('');
      setMessage('Thanks — your feedback was sent.');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Could not send feedback. Try again in a moment.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:py-7">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6 shadow-sm">
          <div className="mb-5">
            <h1 className="text-2xl font-black text-gray-900">Feedback</h1>
            <p className="mt-1 text-sm text-gray-500">
              Help us improve product quality on phone and desktop.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600">Issue type</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as FeedbackType)}
                  className="h-11 rounded-xl border border-gray-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
                >
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600">Severity</span>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as Severity)}
                  className="h-11 rounded-xl border border-gray-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
                >
                  {SEVERITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600">Page/context</span>
                <input
                  value={route}
                  onChange={(e) => setRoute(e.target.value)}
                  className="h-11 rounded-xl border border-gray-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
                  placeholder="/feed"
                  maxLength={240}
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-gray-600">Device type</span>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value as DeviceType)}
                  className="h-11 rounded-xl border border-gray-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
                >
                  <option value="MOBILE">Mobile</option>
                  <option value="DESKTOP">Desktop</option>
                  <option value="TABLET">Tablet</option>
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-600">Browser / user agent</span>
              <input
                value={browser}
                onChange={(e) => setBrowser(e.target.value)}
                className="h-11 rounded-xl border border-gray-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
                maxLength={400}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-600">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={2500}
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-purple-500 focus:outline-none"
                placeholder="What happened, what you expected, and how to reproduce it."
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-600">Screenshot URL (optional)</span>
              <input
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                className="h-11 rounded-xl border border-gray-300 px-3 text-sm focus:border-purple-500 focus:outline-none"
                placeholder="https://..."
                maxLength={1200}
              />
            </label>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            {message && (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="h-11 rounded-xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {submitting ? 'Sending...' : 'Send feedback'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="h-11 rounded-xl border border-gray-300 px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
