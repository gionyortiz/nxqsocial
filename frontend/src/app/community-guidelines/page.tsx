import Link from 'next/link';

export const metadata = { title: 'Community Guidelines — NXQ Social' };

const LAST_UPDATED = 'January 1, 2025';

export default function CommunityGuidelinesPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-purple-600 hover:text-purple-700">
            NXQ Social
          </Link>
          <div className="flex gap-4 text-sm text-gray-500">
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Community Guidelines</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <p className="text-gray-600 text-sm leading-relaxed mb-8">
          NXQ Social is built on trust. These guidelines define what&apos;s welcome on the platform and
          what will get content removed or accounts suspended. They apply to all users and all content,
          including posts, comments, profile information, and direct messages.
        </p>

        <Section title="1. Be Authentic">
          <ul className="list-disc pl-5 space-y-1">
            <li>Use your real identity or a consistent pseudonym.</li>
            <li>Do not impersonate real people, brands, or organisations.</li>
            <li>Do not create fake accounts to inflate metrics or evade bans.</li>
            <li>Do not post fabricated news or deliberately misleading information.</li>
          </ul>
        </Section>

        <Section title="2. Be Safe">
          <ul className="list-disc pl-5 space-y-1">
            <li>Never share your own or others&apos; private information (addresses, phone numbers, financial details) without consent.</li>
            <li>Do not use the platform to stalk, threaten, or harass individuals.</li>
            <li>Do not coordinate or incite real-world violence.</li>
            <li>If you are in crisis, please contact emergency services or a crisis helpline in your country.</li>
          </ul>
        </Section>

        <Section title="3. Protect Children">
          <ul className="list-disc pl-5 space-y-1">
            <li>Sexual content involving minors (CSAM) is absolutely prohibited and will be reported to NCMEC and law enforcement immediately.</li>
            <li>Do not solicit, groom, or exploit minors in any way.</li>
            <li>Do not share content that sexualises or endangers children.</li>
          </ul>
        </Section>

        <Section title="4. Respect Others">
          <ul className="list-disc pl-5 space-y-1">
            <li>Do not post content that attacks people on the basis of race, ethnicity, national origin, religion, gender, sexual orientation, disability, or similar characteristics.</li>
            <li>Disagreement is fine. Targeted harassment is not.</li>
            <li>Do not share intimate images of others without their consent.</li>
          </ul>
        </Section>

        <Section title="5. No Spam or Manipulation">
          <ul className="list-disc pl-5 space-y-1">
            <li>Do not post repetitive, irrelevant, or unsolicited promotional content.</li>
            <li>Do not use bots, scripts, or automated tools to interact with the platform without our prior written permission.</li>
            <li>Do not artificially boost engagement metrics (likes, follows, views).</li>
          </ul>
        </Section>

        <Section title="6. Sensitive Content">
          <ul className="list-disc pl-5 space-y-1">
            <li>Graphic violence or gore must be marked as sensitive and must serve a clear editorial or educational purpose.</li>
            <li>Adult content (nudity, sexual content) is only permitted in designated spaces where age verification is in place, and only where legally allowed.</li>
            <li>Content depicting or glorifying self-harm or suicide is not permitted. Discussion for awareness or support purposes should follow{' '}
              <a href="https://www.sprc.org/resources-programs/safe-messaging-guidelines" className="text-purple-600 hover:underline" target="_blank" rel="noopener noreferrer">safe messaging guidelines</a>.
            </li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <ul className="list-disc pl-5 space-y-1">
            <li>Only post content you have the right to share.</li>
            <li>Respect copyright, trademarks, and other IP rights.</li>
            <li>To report a copyright violation, contact us at{' '}
              <a href="mailto:dmca@nxqsocial.com" className="text-purple-600 hover:underline">dmca@nxqsocial.com</a>.
            </li>
          </ul>
        </Section>

        <Section title="8. Enforcement">
          <p>When content violates these guidelines we may:</p>
          <ul className="list-disc pl-5 mt-2 space-y-1">
            <li>Remove the content.</li>
            <li>Limit the reach of the account.</li>
            <li>Temporarily suspend the account.</li>
            <li>Permanently ban the account.</li>
            <li>Report to law enforcement where required.</li>
          </ul>
          <p className="mt-3">
            You may appeal a moderation decision by emailing{' '}
            <a href="mailto:appeals@nxqsocial.com" className="text-purple-600 hover:underline">appeals@nxqsocial.com</a>{' '}
            within 14 days of the action.
          </p>
        </Section>

        <Section title="9. Reporting Violations">
          Use the report button on any post or profile to flag content that violates these guidelines.
          Urgent safety issues (e.g., CSAM, credible threats of violence) can also be emailed directly to{' '}
          <a href="mailto:safety@nxqsocial.com" className="text-purple-600 hover:underline">safety@nxqsocial.com</a>.
        </Section>

        <Section title="10. Changes">
          We may update these guidelines as the platform evolves. Significant changes will be announced
          in-app and via email.
        </Section>
      </main>

      <footer className="border-t border-gray-100 px-6 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} NXQ Social ·{' '}
        <Link href="/terms" className="hover:text-gray-600">Terms</Link> ·{' '}
        <Link href="/privacy" className="hover:text-gray-600">Privacy</Link>
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
