import { InfoPage } from '@/components/InfoPage';

export default function ContactPage() {
  return (
    <InfoPage
      title="Contact Us"
      subtitle="We would love to hear from you."
      sections={[
        {
          heading: 'Support',
          body: 'For help with your account, verification, or a technical problem, email support@nxqsocial.com and our team will get back to you.',
        },
        {
          heading: 'Safety reports',
          body: 'To report harmful content or a safety concern, use the report option on any post or profile, or email safety@nxqsocial.com.',
        },
        {
          heading: 'Business & press',
          body: 'For partnerships, press, or media inquiries, email hello@nxqsocial.com.',
        },
      ]}
    />
  );
}
