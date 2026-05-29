'use client';

interface TrustBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

const TIERS: Record<string, { icon: string; color: string; label: string }> = {
  UNVERIFIED:        { icon: '⚠️', color: 'text-red-400',    label: 'Unverified' },
  BASIC:             { icon: '○',  color: 'text-gray-400',   label: 'Basic' },
  HUMAN_VERIFIED:    { icon: '✓',  color: 'text-blue-400',   label: 'Human Verified' },
  ID_VERIFIED:       { icon: '🪪', color: 'text-yellow-400', label: 'ID Verified' },
  BUSINESS_VERIFIED: { icon: '🏢', color: 'text-purple-400', label: 'Business' },
};

export function TrustBadge({ status, size = 'sm', showLabel = false }: TrustBadgeProps) {
  const tier = TIERS[status] ?? TIERS.BASIC;

  if (status === 'BASIC') return null; // no badge for basic users — keep UI clean

  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${
        size === 'md' ? 'text-sm' : 'text-xs'
      } ${tier.color}`}
      title={tier.label}
    >
      <span>{tier.icon}</span>
      {showLabel && <span>{tier.label}</span>}
    </span>
  );
}
