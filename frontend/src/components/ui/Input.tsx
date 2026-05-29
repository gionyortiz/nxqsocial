'use client';

import { cn } from '@/lib/utils';
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="flex flex-col gap-1 w-full">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <input
        ref={ref}
        className={cn(
          'w-full px-4 py-2.5 rounded-xl border bg-white text-gray-900 text-sm',
          'focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent',
          'placeholder:text-gray-400 transition',
          error ? 'border-red-400' : 'border-gray-200',
          className,
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  ),
);
Input.displayName = 'Input';
