import Link from 'next/link';

export const metadata = { title: 'Terms of Service — NXQ Social' };

const LAST_UPDATED = 'January 1, 2025';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-purple-600 hover:text-purple-700">
            NXQ Social
          </Link>
          <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-700">
            Privacy Policy ?
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Terms of Service</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Acceptance of Terms">
          By creating an account or using NXQ Social you agree to be bound by these Terms of Service
          and our{' '}
          <Link href="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>.
          If you do not agree, do not use the platform.
        </Section>

        <Section title="2. Eligibility">
          You must be at least 13 years old to use NXQ Social. By using the platform you represent that
          you meet this requirement and that all information you provide is accurate.
        </Section>

        <Section title="3. Your Account">
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for maintaining the confidentiality of your password.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
            <li>You must notify us immediately of any unauthorised use of your account.</li>
            <li>One account per person; creating multiple accounts to circumvent bans is prohibited.</li>
          </ul>
        </Section>

        <Section title="4. Content Standards">
          You may not post content that:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Is illegal, harmful, threatening, abusive, harassing, or defamatory.</li>
            <li>Contains sexual content involving minors (CSAM) — zero tolerance, immediate ban and report to NCMEC.</li>
            <li>Promotes violence, terrorism, or self-harm.</li>
            <li>Infringes intellectual property rights of others.</li>
            <li>Contains malware, spam, or unsolicited commercial messages.</li>
            <li>Constitutes impersonation of any person or entity.</li>
          </ul>
        </Section>

        <Section title="5. Intellectual Property">
          You retain ownership of content you post. By posting, you grant NXQ Social a non-exclusive,
          royalty-free, worldwide licence to display, reproduce, and distribute your content on the platform.
          NXQ Social owns all intellectual property in the platform itself, including code, design, and brand assets.
        </Section>

        <Section title="6. Prohibited Conduct">
          You may not:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Scrape, crawl, or otherwise extract data from the platform without written permission.</li>
            <li>Interfere with or disrupt the platform's infrastructure.</li>
            <li>Attempt to gain unauthorised access to any part of the platform or its systems.</li>
            <li>Use automated tools to create accounts or interact with the platform.</li>
          </ul>
        </Section>

        <Section title="7. Payments & Subscriptions">
          Subscription fees are billed in advance. All payments are processed by Stripe. You may cancel
          at any time; access continues until the end of the current billing period. Refunds are provided
          at our discretion as required by applicable law.
        </Section>

        <Section title="8. Termination">
          We may suspend or terminate your account at any time for violation of these Terms, illegal
          activity, or at our sole discretion with reasonable notice. You may delete your account at
          any time from your account settings.
        </Section>

        <Section title="9. Disclaimers">
          The platform is provided &quot;as is&quot; without warranties of any kind. We do not guarantee
          uninterrupted, error-free access to the platform. We are not liable for user-generated content.
        </Section>

        <Section title="10. Limitation of Liability">
          To the maximum extent permitted by law, NXQ Social shall not be liable for any indirect,
          incidental, special, or consequential damages arising from your use of the platform. Our total
          liability shall not exceed the amount you paid us in the 12 months preceding the claim.
        </Section>

        <Section title="11. Governing Law">
          These Terms are governed by the laws of the jurisdiction in which NXQ Social is incorporated,
          without regard to conflict-of-law principles.
        </Section>

        <Section title="12. Changes to Terms">
          We may modify these Terms at any time. Material changes will be communicated by email with at
          least 14 days&apos; notice. Continued use after the effective date constitutes acceptance.
        </Section>

        <Section title="13. Contact">
          Questions about these Terms? Contact us at{' '}
          <a href="mailto:legal@nxqsocial.com" className="text-purple-600 hover:underline">legal@nxqsocial.com</a>.
        </Section>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} NXQ Social · <Link href="/privacy" className="hover:text-gray-600">Privacy Policy</Link> · <Link href="/community-guidelines" className="hover:text-gray-600">Community Guidelines</Link>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">{title}</h2>
      <div className="text-gray-600 text-sm leading-relaxed">{children}</div>
    </section>
  );
}
