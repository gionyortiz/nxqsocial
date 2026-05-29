'use client';

/**
 * NexaQuantum brand logo — a layered hexagonal "quantum core" emblem rendered
 * entirely in SVG so it stays crisp at any size and needs no image asset.
 *
 * Usage:
 *   <Logo size={40} />                      // just the mark
 *   <Logo size={32} withWordmark />         // mark + "NexaQuantum" wordmark
 *   <Logo size={32} withWordmark wordmark="NXQ Social" />
 */

type LogoProps = {
  /** Pixel size of the square mark. */
  size?: number;
  /** Show the text wordmark beside the mark. */
  withWordmark?: boolean;
  /** Override the wordmark text. */
  wordmark?: string;
  className?: string;
};

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  // Unique id suffix so multiple instances don't clash on gradient/filter ids.
  const uid = `nxq-${size}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="NexaQuantum logo"
    >
      <defs>
        {/* Light-catching steel for top/left facets */}
        <linearGradient id={`${uid}-steelLight`} x1="30" y1="8" x2="90" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.4" stopColor="#d7deeb" />
          <stop offset="1" stopColor="#9aa7bd" />
        </linearGradient>
        {/* Darker steel for bottom/right facets */}
        <linearGradient id={`${uid}-steelDark`} x1="40" y1="40" x2="100" y2="116" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7c8aa3" />
          <stop offset="0.6" stopColor="#4a566b" />
          <stop offset="1" stopColor="#2b3445" />
        </linearGradient>
        <linearGradient id={`${uid}-glow`} x1="60" y1="22" x2="60" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a5f3fc" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={`${uid}-cavity`} cx="50%" cy="50%" r="55%">
          <stop offset="0" stopColor="#0b3a5c" />
          <stop offset="0.7" stopColor="#0a2740" />
          <stop offset="1" stopColor="#06121f" />
        </radialGradient>
        <radialGradient id={`${uid}-core`} cx="42%" cy="38%" r="62%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.3" stopColor="#cdeeff" />
          <stop offset="0.65" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#075985" />
        </radialGradient>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#a855f7" stopOpacity="0.9" />
          <stop offset="0.55" stopColor="#7c3aed" stopOpacity="0.45" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-purple`} x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#d8b4fe" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
        <filter id={`${uid}-shadow`} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="3.5" floodColor="#a855f7" floodOpacity="0.7" />
        </filter>
        <filter id={`${uid}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
      </defs>

      {/* Purple aura glow behind the mark */}
      <circle cx="60" cy="60" r="58" fill={`url(#${uid}-aura)`} />

      {/* ── Outer hexagon: split into light + dark facets for a 3D bevel ── */}
      {/* dark base (full) */}
      <polygon
        points="60,5 109,32.5 109,87.5 60,115 11,87.5 11,32.5"
        fill={`url(#${uid}-steelDark)`}
        stroke={`url(#${uid}-purple)`}
        strokeWidth="3"
        filter={`url(#${uid}-shadow)`}
      />
      {/* light facet over the top-left half */}
      <polygon
        points="60,5 109,32.5 60,60 11,32.5"
        fill={`url(#${uid}-steelLight)`}
        opacity="0.95"
      />
      <polygon
        points="11,32.5 60,60 11,87.5"
        fill={`url(#${uid}-steelLight)`}
        opacity="0.55"
      />

      {/* Beveled inner edge of the metal ring */}
      <polygon
        points="60,18 98,39 98,81 60,102 22,81 22,39"
        fill="none"
        stroke="#e8edf5"
        strokeWidth="1.5"
        opacity="0.6"
      />

      {/* ── Circuit traces etched into the metal ── */}
      <g stroke="#0ea5e9" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
        <path d="M60 8 V20" />
        <path d="M88 24 L80 38" />
        <path d="M104 50 L92 56 M104 50 L99 44" />
        <path d="M104 70 L92 64" />
        <path d="M88 96 L80 82" />
        <path d="M32 96 L40 82" />
        <path d="M16 70 L28 64" />
        <path d="M16 50 L28 56 M16 50 L21 44" />
        <path d="M32 24 L40 38" />
      </g>
      <g fill="#67e8f9">
        <circle cx="80" cy="38" r="1.9" /><circle cx="92" cy="56" r="1.9" />
        <circle cx="92" cy="64" r="1.9" /><circle cx="80" cy="82" r="1.9" />
        <circle cx="40" cy="82" r="1.9" /><circle cx="28" cy="64" r="1.9" />
        <circle cx="28" cy="56" r="1.9" /><circle cx="40" cy="38" r="1.9" />
      </g>

      {/* Glowing cyan rim hexagon */}
      <polygon
        points="60,22 94,41 94,79 60,98 26,79 26,41"
        fill="none"
        stroke={`url(#${uid}-glow)`}
        strokeWidth="3.2"
      />
      <polygon
        points="60,22 94,41 94,79 60,98 26,79 26,41"
        fill="none"
        stroke="#a5f3fc"
        strokeWidth="6"
        opacity="0.35"
        filter={`url(#${uid}-soft)`}
      />

      {/* Recessed dark cavity */}
      <polygon
        points="60,33 85,47.5 85,72.5 60,87 35,72.5 35,47.5"
        fill={`url(#${uid}-cavity)`}
        stroke={`url(#${uid}-glow)`}
        strokeWidth="2"
      />

      {/* Inner stepped hexagon */}
      <polygon
        points="60,41 78,51.5 78,68.5 60,79 42,68.5 42,51.5"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1.6"
        opacity="0.8"
      />

      {/* Core glow halo */}
      <circle cx="60" cy="60" r="20" fill="#22d3ee" opacity="0.35" filter={`url(#${uid}-soft)`} />

      {/* Quantum core orb */}
      <circle cx="60" cy="60" r="13.5" fill={`url(#${uid}-core)`} />
      <circle cx="60" cy="60" r="13.5" fill="none" stroke="#e0f2fe" strokeWidth="1.5" opacity="0.8" />
      <ellipse cx="55.5" cy="55" rx="4.5" ry="3.2" fill="#ffffff" opacity="0.92" />
    </svg>
  );
}

export default function Logo({ size = 40, withWordmark = false, wordmark = 'NexaQuantum', className }: LogoProps) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span
        className="font-black tracking-tight bg-gradient-to-r from-purple-500 via-fuchsia-500 to-cyan-400 bg-clip-text text-transparent"
        style={{ fontSize: size * 0.55 }}
      >
        {wordmark}
      </span>
    </span>
  );
}
