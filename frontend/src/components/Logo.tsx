'use client';

import { useId } from 'react';

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  wordmark?: string;
  className?: string;
};

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  const uid = `nxq-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="NXQ Social logo"
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#32116d" />
          <stop offset="0.45" stopColor="#120827" />
          <stop offset="1" stopColor="#071b3d" />
        </linearGradient>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="46%" r="58%">
          <stop offset="0" stopColor="#d946ef" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#7c3aed" stopOpacity="0.55" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-neon`} x1="17" y1="17" x2="103" y2="103" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f5d0fe" />
          <stop offset="0.38" stopColor="#a855f7" />
          <stop offset="0.72" stopColor="#4f46e5" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id={`${uid}-steelLight`} x1="31" y1="15" x2="91" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.42" stopColor="#e8edf7" />
          <stop offset="1" stopColor="#8b95ad" />
        </linearGradient>
        <linearGradient id={`${uid}-steelDark`} x1="37" y1="38" x2="96" y2="107" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8790aa" />
          <stop offset="0.52" stopColor="#33405c" />
          <stop offset="1" stopColor="#141a2b" />
        </linearGradient>
        <radialGradient id={`${uid}-core`} cx="42%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.28" stopColor="#e9d5ff" />
          <stop offset="0.62" stopColor="#818cf8" />
          <stop offset="1" stopColor="#1d4ed8" />
        </radialGradient>
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.8" />
        </filter>
        <filter id={`${uid}-shadow`} x="-45%" y="-45%" width="190%" height="190%">
          <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#3b0764" floodOpacity="0.8" />
        </filter>
      </defs>

      <rect width="120" height="120" rx="24" fill="#07071a" />
      <rect x="7" y="7" width="106" height="106" rx="26" fill={`url(#${uid}-bg)`} stroke={`url(#${uid}-neon)`} strokeWidth="1.8" />
      <circle cx="60" cy="58" r="53" fill={`url(#${uid}-aura)`} />
      <circle cx="60" cy="58" r="44" fill="#a855f7" opacity="0.24" filter={`url(#${uid}-blur)`} />

      <g filter={`url(#${uid}-shadow)`}>
        <polygon points="60,13 103,37 103,83 60,107 17,83 17,37" fill={`url(#${uid}-steelDark)`} stroke={`url(#${uid}-neon)`} strokeWidth="3" />
        <polygon points="60,13 103,37 60,60 17,37" fill={`url(#${uid}-steelLight)`} opacity="0.98" />
        <polygon points="17,37 60,60 17,83" fill={`url(#${uid}-steelLight)`} opacity="0.45" />
        <polygon points="103,37 60,60 103,83" fill="#1b2140" opacity="0.82" />
        <polygon points="60,24 92,42 92,78 60,96 28,78 28,42" fill="none" stroke="#f5d0fe" strokeWidth="1.1" opacity="0.72" />
        <polygon points="60,28 87,44 87,76 60,92 33,76 33,44" fill="#120827" stroke="#8b5cf6" strokeWidth="2.2" />
        <polygon points="60,38 78,49 78,71 60,82 42,71 42,49" fill="#0b1027" stroke="#c4b5fd" strokeWidth="2.1" />
        <polygon points="60,44 73,52 73,68 60,76 47,68 47,52" fill="#172554" stroke="#22d3ee" strokeWidth="1.6" />

        <g stroke="#d946ef" strokeWidth="1.15" strokeLinecap="round" opacity="0.82">
          <path d="M31 49 H44" />
          <path d="M76 49 H89" />
          <path d="M31 71 H44" />
          <path d="M76 71 H89" />
          <path d="M45 31 L52 43" />
          <path d="M75 31 L68 43" />
          <path d="M45 89 L52 77" />
          <path d="M75 89 L68 77" />
          <path d="M21 57 H30" />
          <path d="M90 57 H99" />
          <path d="M21 63 H30" />
          <path d="M90 63 H99" />
        </g>
        <g fill="#c084fc" stroke="#f5d0fe" strokeWidth="0.7">
          <circle cx="31" cy="49" r="3.2" />
          <circle cx="89" cy="49" r="3.2" />
          <circle cx="31" cy="71" r="3.2" />
          <circle cx="89" cy="71" r="3.2" />
          <circle cx="45" cy="31" r="2.6" />
          <circle cx="75" cy="31" r="2.6" />
          <circle cx="45" cy="89" r="2.6" />
          <circle cx="75" cy="89" r="2.6" />
        </g>
        <circle cx="60" cy="60" r="18" fill="#7c3aed" opacity="0.55" filter={`url(#${uid}-blur)`} />
        <circle cx="60" cy="60" r="13.5" fill={`url(#${uid}-core)`} stroke="#f5f3ff" strokeWidth="1.7" />
        <circle cx="60" cy="60" r="8" fill="#312e81" opacity="0.38" />
        <ellipse cx="55.5" cy="55.5" rx="4.8" ry="3.5" fill="#ffffff" opacity="0.94" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 40, withWordmark = false, wordmark = 'NXQ Social', className }: LogoProps) {
  if (!withWordmark) return <LogoMark size={size} className={className} />;

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <LogoMark size={size} />
      <span
        className="font-black bg-gradient-to-r from-white via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent"
        style={{ fontSize: size * 0.55, letterSpacing: 0 }}
      >
        {wordmark}
      </span>
    </span>
  );
}