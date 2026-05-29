import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — NXQ Social' };

const LAST_UPDATED = 'January 1, 2025';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-purple-600 hover:text-purple-700">
            NXQ Social
          </Link>
          <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-700">
            Terms of Service ?
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Introduction">
          NXQ Social (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your personal information and
          your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard
          your information when you use our platform.
        </Section>

        <Section title="2. Information We Collect">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Account data:</strong> email address, username, display name, and password (hashed, never stored in plain text).</li>
            <li><strong>Profile data:</strong> bio, profile photo, and any optional information you choose to provide.</li>
            <li><strong>Content:</strong> posts, images, videos, and comments you create on the platform.</li>
            <li><strong>Usage data:</strong> pages viewed, features used, and timestamps of activity.</li>
            <li><strong>Device data:</strong> IP address, browser type, and operating system (collected automatically).</li>
          </ul>
        </Section>

        <Section title="3. How We Use Your Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide and maintain the platform.</li>
            <li>To verify your identity and prevent fraud.</li>
            <li>To process payments and manage subscriptions.</li>
            <li>To send transactional emails (e.g., verification, password reset).</li>
            <li>To moderate content and enforce our community guidelines.</li>
            <li>To improve our services through aggregated, anonymised analytics.</li>
          </ul>
        </Section>

        <Section title="4. Sharing of Information">
          We do not sell your personal data. We share information only:
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>With service providers acting on our behalf (Stripe, AWS, Resend, Twilio) under data-processing agreements.</li>
            <li>When required by law or to protect the rights and safety of users.</li>
            <li>With your explicit consent.</li>
          </ul>
        </Section>

        <Section title="5. Data Retention">
          We retain your account data for as long as your account is active. You may request deletion of your
          account and associated data at any time by contacting us at{' '}
          <a href="mailto:privacy@nxqsocial.com" className="text-purple-600 hover:underline">privacy@nxqsocial.com</a>.
          Certain data may be retained for legal compliance purposes.
        </Section>

        <Section title="6. Cookies">
          We use essential cookies and local storage tokens for authentication. We do not use third-party
          advertising cookies. You can disable cookies in your browser settings, but this may affect
          platform functionality.
        </Section>

        <Section title="7. Your Rights">
          Depending on your jurisdiction you may have the right to access, correct, or delete your personal
          data, object to or restrict its processing, and request data portability. Contact us at{' '}
          <a href="mailto:privacy@nxqsocial.com" className="text-purple-600 hover:underline">privacy@nxqsocial.com</a>{' '}
          to exercise any of these rights.
        </Section>

        <Section title="8. Security">
          We use industry-standard measures including TLS encryption in transit, bcrypt-hashed passwords,
          and least-privilege IAM policies for cloud resources. No method of transmission over the internet
          is 100% secure; we cannot guarantee absolute security.
        </Section>

        <Section title="9. Children">
          NXQ Social is not directed at children under 13. We do not knowingly collect personal data from
          anyone under 13. If you believe a child has provided us with personal data, please contact us
          immediately.
        </Section>

        <Section title="10. Changes to This Policy">
          We may update this policy from time to time. We will notify registered users by email of material
          changes. Continued use of the platform after changes constitutes acceptance of the revised policy.
        </Section>

        <Section title="11. Contact Us">
          Questions about this Privacy Policy? Contact us at{' '}
          <a href="mailto:privacy@nxqsocial.com" className="text-purple-600 hover:underline">privacy@nxqsocial.com</a>.
        </Section>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} NXQ Social · <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link> · <Link href="/community-guidelines" className="hover:text-gray-600">Community Guidelines</Link>
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
