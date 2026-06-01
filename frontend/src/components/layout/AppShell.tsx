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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="pb-20 md:pb-0 min-h-screen md:pl-64 overflow-x-hidden">
        <div className="mx-auto max-w-[1540px] w-full min-w-0 flex justify-center gap-5 lg:gap-6 xl:gap-8 px-2 sm:px-4 xl:px-6">
          <div className="w-full min-w-0 max-w-[860px]">{children}</div>
          {aside && (
            <aside className="hidden lg:block w-[360px] flex-shrink-0 py-4">{aside}</aside>
          )}
        </div>
      </main>
    </div>
  );
}
