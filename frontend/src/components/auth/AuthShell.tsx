import Link from 'next/link';
import { ShieldCheck, Sparkles, Users } from 'lucide-react';
import Logo from '@/components/Logo';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="nxq-auth-shell">
      <section className="nxq-auth-hero" aria-label="NXQ Social introduction">
        <Link href="/" className="flex items-center gap-3 w-fit">
          <Logo size={56} className="rounded-[18px] shadow-[var(--shadow-brand)]" />
          <span className="text-2xl font-extrabold tracking-tight text-white">NXQ <span className="text-fuchsia-400">Social</span></span>
        </Link>

        <div className="max-w-xl py-16">
          <p className="nxq-kicker">Trust-first social network</p>
          <h2 className="mt-5 text-5xl font-black leading-[1.02] tracking-[-0.05em] text-white xl:text-6xl">
            A calmer place to create, connect, and belong.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-400">
            Human-centered profiles, transparent trust signals, and safer discovery without the visual noise.
          </p>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {[
              [ShieldCheck, 'Trust signals', 'Context you can see'],
              [Users, 'Human community', 'People before metrics'],
              [Sparkles, 'Focused creation', 'A cleaner experience'],
            ].map(([Icon, heading, copy]) => {
              const FeatureIcon = Icon as typeof ShieldCheck;
              return (
                <div key={heading as string} className="nxq-panel-subtle p-4">
                  <FeatureIcon size={18} className="text-fuchsia-400" />
                  <p className="mt-3 text-sm font-semibold text-slate-100">{heading as string}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{copy as string}</p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-slate-600">© {new Date().getFullYear()} NXQ Social · Built around trust.</p>
      </section>

      <section className="nxq-auth-card-wrap">
        <div className="nxq-auth-card">
          <div className="mb-7">
            <div className="mb-5 flex items-center gap-2 md:hidden">
              <Logo size={48} className="rounded-2xl shadow-[var(--shadow-brand)]" />
              <span className="text-lg font-extrabold text-white">NXQ Social</span>
            </div>
            <p className="nxq-kicker">Welcome to NXQ</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}
