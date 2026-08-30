import Image from 'next/image';

type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  wordmark?: string;
  className?: string;
};

const NXQ_SOCIAL_LOGO = '/icon.png';

export function LogoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <Image
      src={NXQ_SOCIAL_LOGO}
      alt="NXQ Social logo"
      width={size}
      height={size}
      className={className}
      sizes={`${size}px`}
    />
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
