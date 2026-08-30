'use client';

import { cn } from '@/lib/utils';
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1.5 w-full">
      {label && <label className="text-sm font-semibold text-slate-200">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'w-full px-4 py-3 rounded-xl border bg-[#090e17] text-slate-100 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-purple-500/60 focus:border-purple-500/60',
          'placeholder:text-slate-600 transition',
          error ? 'border-red-400/80' : 'border-white/10',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  ),
);
Input.displayName = 'Input';
