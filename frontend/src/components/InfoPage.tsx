'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';

export interface InfoSection {
  heading?: string;
  body: string;
}

interface Props {
  title: string;
  subtitle?: string;
  sections: InfoSection[];
}

export function InfoPage({ title, subtitle, sections }: Props) {
  const router = useRouter();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-purple-600 transition-colors mb-5"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="rounded-3xl bg-white ring-1 ring-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-7 bg-gradient-to-br from-purple-600 to-fuchsia-600 text-white">
            <h1 className="text-2xl sm:text-3xl font-black">{title}</h1>
            {subtitle && <p className="text-white/80 text-sm mt-1.5 leading-relaxed">{subtitle}</p>}
          </div>

          <div className="px-6 py-6 space-y-6">
            {sections.map((s, i) => (
              <div key={i}>
                {s.heading && (
                  <h2 className="text-base font-bold text-gray-900 mb-1.5">{s.heading}</h2>
                )}
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{s.body}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6 tracking-wide">
          © {new Date().getFullYear()} NXQ SOCIAL
        </p>
      </div>
    </AppShell>
  );
}
