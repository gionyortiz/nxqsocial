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
      <main className="md:ml-64 pb-20 md:pb-0 min-h-screen">
        <div className="mx-auto flex justify-center gap-8 px-0 sm:px-4 xl:px-8">
          <div className="w-full max-w-xl">{children}</div>
          {aside && (
            <aside className="hidden lg:block w-80 flex-shrink-0 py-6">{aside}</aside>
          )}
        </div>
      </main>
    </div>
  );
}
