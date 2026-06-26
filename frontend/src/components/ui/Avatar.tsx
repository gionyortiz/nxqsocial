'use client';

import Image from 'next/image';
import { useState } from 'react';
import { cn, resolveMediaUrl } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizes = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 };
const ringSize = { xs: 'ring-1', sm: 'ring-1', md: 'ring-2', lg: 'ring-2', xl: 'ring-2' };

export function Avatar({ src, alt, size = 'md', className }: AvatarProps) {
  const px = sizes[size];
  const initials = (alt || '?').slice(0, 2).toUpperCase();
  const resolved = src ? resolveMediaUrl(src) : '';
  const [failedForSrc, setFailedForSrc] = useState<string | null>(null);

  const showImage = !!resolved && failedForSrc !== resolved;

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-purple-400 to-pink-400',
        `ring-white ${ringSize[size]}`,
        className,
      )}
      style={{ width: px, height: px }}
    >
      {showImage ? (
        <Image
          src={resolved}
          alt={alt}
          width={px}
          height={px}
          className="w-full h-full object-cover"
          unoptimized
          onError={() => setFailedForSrc(resolved)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white font-bold" style={{ fontSize: px * 0.35 }}>
          {initials}
        </div>
      )}
    </div>
  );
}
