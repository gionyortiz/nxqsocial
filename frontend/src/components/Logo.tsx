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
        <linearGradient id={`${uid}-steel`} x1="20" y1="10" x2="100" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e8edf5" />
          <stop offset="0.45" stopColor="#9aa7bd" />
          <stop offset="0.75" stopColor="#5b6b85" />
          <stop offset="1" stopColor="#3a4456" />
        </linearGradient>
        <linearGradient id={`${uid}-glow`} x1="60" y1="22" x2="60" y2="98" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7dd3fc" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={`${uid}-core`} cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#bae6fd" />
          <stop offset="0.7" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#0369a1" />
        </radialGradient>
        <filter id={`${uid}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0ea5e9" floodOpacity="0.55" />
        </filter>
      </defs>

      {/* Outer hexagon — metallic body */}
      <polygon
        points="60,6 108,33 108,87 60,114 12,87 12,33"
        fill={`url(#${uid}-steel)`}
        stroke="#cfd8e6"
        strokeWidth="2"
        filter={`url(#${uid}-shadow)`}
      />

      {/* Glowing cyan rim hexagon */}
      <polygon
        points="60,16 99,38 99,82 60,104 21,82 21,38"
        fill="none"
        stroke={`url(#${uid}-glow)`}
        strokeWidth="3"
      />

      {/* Circuit traces */}
      <g stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
        <path d="M60 16 V32" />
        <path d="M99 38 L82 48" />
        <path d="M99 82 L82 72" />
        <path d="M60 104 V88" />
        <path d="M21 82 L38 72" />
        <path d="M21 38 L38 48" />
      </g>
      <g fill="#7dd3fc">
        <circle cx="82" cy="48" r="2.4" />
        <circle cx="82" cy="72" r="2.4" />
        <circle cx="38" cy="48" r="2.4" />
        <circle cx="38" cy="72" r="2.4" />
        <circle cx="60" cy="32" r="2.4" />
        <circle cx="60" cy="88" r="2.4" />
      </g>

      {/* Inner hexagon ring */}
      <polygon
        points="60,34 84,48 84,72 60,86 36,72 36,48"
        fill="#1e293b"
        stroke={`url(#${uid}-glow)`}
        strokeWidth="2"
      />

      {/* Quantum core orb */}
      <circle cx="60" cy="60" r="13" fill={`url(#${uid}-core)`} />
      <circle cx="60" cy="60" r="13" fill="none" stroke="#e0f2fe" strokeWidth="1.5" opacity="0.7" />
      <circle cx="55.5" cy="55.5" r="3.5" fill="#ffffff" opacity="0.9" />
    </svg>
  );
}

export default function Logo({ size = 40, withWordmark = false, wordmark = 'NexaQuantum', className }: LogoProps) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span
        className="font-black tracking-tight bg-gradient-to-r from-sky-400 via-cyan-400 to-blue-500 bg-clip-text text-transparent"
        style={{ fontSize: size * 0.55 }}
      >
        {wordmark}
      </span>
    </span>
  );
}
