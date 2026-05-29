'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface VerificationStatus {
  verificationStatus: string;
  trustScore: number;
  verifications: Array<{ id: string; level: string; status: string; createdAt: string }>;
}

const TIERS = [
  {
    key: 'HUMAN_VERIFIED',
    label: 'Human Verified',
    icon: '✓',
    color: 'text-blue-600',
    border: 'border-blue-200 bg-blue-50',
    description: 'Confirm you\'re a real person. Increases your trust score to 40.',
    how: 'We send a one-time SMS code to verify your phone number.',
  },
  {
    key: 'ID_VERIFIED',
    label: 'ID Verified',
    icon: '🪪',
    color: 'text-yellow-600',
    border: 'border-yellow-200 bg-yellow-50',
    description: 'Verify your government-issued ID. Trust score 70. Unlocks gold badge.',
    how: 'Powered by Stripe Identity — securely verify your passport, driving licence, or national ID card. Takes 2 minutes.',
  },
  {
    key: 'BUSINESS_VERIFIED',
    label: 'Business Verified',
    icon: '🏢',
    color: 'text-purple-600',
    border: 'border-purple-200 bg-purple-50',
    description: 'For brands and organisations. Trust score 85.',
    how: 'Provide your business registration number and a domain-verified email.',
  },
];

const TIER_ORDER = ['UNVERIFIED', 'BASIC', 'HUMAN_VERIFIED', 'ID_VERIFIED', 'BUSINESS_VERIFIED'];

export default function VerifyPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [requesting, setRequesting] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    api.get('/verification/status').then(({ data }) => setStatus(data)).catch(() => {});
  }, [user, router]);

  const request = async (tier: string) => {
    setRequesting(tier);
    setError('');
    try {
      if (tier === 'ID_VERIFIED') {
        // Use Stripe Identity — redirect to Stripe-hosted verification page
        const { data } = await api.post('/verification/start-identity-check');
        if (data.url) window.location.href = data.url;
        return;
      }
      await api.post('/verification/request', { tier });
      setDone(tier);
      // refresh
      const { data } = await api.get('/verification/status');
      setStatus(data);
    } catch (e: any) {
      setError(e.response?.data?.message ?? 'Request failed');
    } finally {
      setRequesting('');
    }
  };

  const currentTierIdx = TIER_ORDER.indexOf(status?.verificationStatus ?? 'BASIC');

  return (
    <AppShell>
      <div className="max-w-xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify your account</h1>
        <p className="text-gray-500 text-sm mb-6">
          Higher verification tiers increase your trust score and unlock new badges, giving your content more reach on the Verified feed.
        </p>

        {status && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Current status</p>
              <p className="font-semibold text-gray-900">{status.verificationStatus.replace('_', ' ')}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Trust score</p>
              <p className="text-2xl font-bold text-purple-600">{status.trustScore}</p>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        <div className="flex flex-col gap-4">
          {TIERS.map((tier, idx) => {
            const tierIdx = TIER_ORDER.indexOf(tier.key);
            const isCurrentOrBelow = tierIdx <= currentTierIdx;
            const hasPending = status?.verifications.some((v) => v.level === tier.key && v.status === 'PENDING');

            return (
              <div key={tier.key} className={`rounded-2xl border p-5 ${tier.border}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`font-bold text-base ${tier.color} flex items-center gap-2`}>
                      <span className="text-xl">{tier.icon}</span> {tier.label}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">{tier.description}</p>
                    <p className="text-xs text-gray-400 mt-2">{tier.how}</p>
                  </div>
                  <div className="flex-shrink-0 mt-1">
                    {isCurrentOrBelow ? (
                      <span className="text-xs font-medium text-green-600 bg-green-100 px-3 py-1 rounded-full">Active</span>
                    ) : hasPending ? (
                      <span className="text-xs font-medium text-yellow-600 bg-yellow-100 px-3 py-1 rounded-full">Pending</span>
                    ) : done === tier.key ? (
                      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-3 py-1 rounded-full">Submitted!</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => request(tier.key)}
                        disabled={!!requesting}
                      >
                        {requesting === tier.key ? 'Submitting…' : 'Apply'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {status?.verifications && status.verifications.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">Application history</h2>
            <div className="flex flex-col gap-2">
              {status.verifications.map((v) => (
                <div key={v.id} className="flex items-center justify-between text-sm bg-white border border-gray-100 rounded-xl px-4 py-3">
                  <span className="text-gray-700">{v.level.replace('_', ' ')}</span>
                  <span className={`font-medium ${v.status === 'APPROVED' ? 'text-green-600' : v.status === 'REJECTED' ? 'text-red-500' : 'text-yellow-600'}`}>
                    {v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
