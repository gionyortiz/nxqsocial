'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Radio, Video, Mic, Users, MessageSquare, ArrowRight } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { newLiveId, liveHref } from '@/lib/live';

export default function NewLivePage() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const goLive = () => {
    if (starting) return;
    setStarting(true);
    const room = newLiveId();
    router.push(liveHref(room, true));
  };

  return (
    <AppShell>
      <div className="px-4 py-6 max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <span className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-600 to-red-600 text-white">
            <Radio size={22} />
          </span>
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
              Go Live
              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold uppercase tracking-wide">
                Beta
              </span>
            </h1>
            <p className="text-sm text-gray-500">
              Start a live broadcast with video, audio, viewer count and chat.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white ring-1 ring-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3">What viewers get</h2>
          <ul className="flex flex-col gap-3 mb-6">
            <Feature icon={Video} title="Live video & audio" desc="Broadcast straight from your camera and mic." />
            <Feature icon={Users} title="Viewer count" desc="See how many people are watching in real time." />
            <Feature icon={MessageSquare} title="Live chat & reactions" desc="Viewers comment and send hearts ❤️ live." />
            <Feature icon={Mic} title="One broadcaster" desc="You present; viewers join watch-only." />
          </ul>

          <button
            onClick={goLive}
            disabled={starting}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-semibold shadow-lg disabled:opacity-60"
          >
            <Radio size={18} /> {starting ? 'Starting…' : 'Start broadcast'} <ArrowRight size={18} />
          </button>
          <p className="text-xs text-gray-400 text-center mt-3">
            Your browser will ask for camera & microphone permission.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-rose-50 text-rose-600 shrink-0">
        <Icon size={18} />
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
    </li>
  );
}
