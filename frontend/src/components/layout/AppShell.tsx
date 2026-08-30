'use client';

import { Navbar } from './Navbar';

export function AppShell({
  children,
  aside,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Navbar />
      {/* Extra bottom padding on mobile for the floating pill nav */}
      <main className="pb-28 md:pb-0 min-h-screen md:pl-64 overflow-x-hidden">
        <div className="mx-auto max-w-[1510px] w-full min-w-0 flex justify-center gap-5 xl:gap-7 px-2 sm:px-5 xl:px-8">
          <div className="w-full min-w-0 max-w-[720px]">{children}</div>
          {aside && (
            <aside className="hidden xl:block w-[350px] flex-shrink-0 py-5">{aside}</aside>
          )}
        </div>
      </main>
    </div>
  );
}
