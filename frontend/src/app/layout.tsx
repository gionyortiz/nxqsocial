import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { IncomingCallModal } from "@/components/call/IncomingCallModal";
import { FloatingCall } from "@/components/call/FloatingCall";
import { I18nProvider } from "@/lib/i18n";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "NXQ Social",
  description: "A creator-first social platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased dark`}>
      <body className="min-h-full font-[var(--font-geist)]" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
        <I18nProvider>
          {children}
          <IncomingCallModal />
          <FloatingCall />
        </I18nProvider>
      </body>
    </html>
  );
}
