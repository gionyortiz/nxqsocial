import { InfoPage } from '@/components/InfoPage';

export default function PressPage() {
  return (
    <InfoPage
      title="Press"
      subtitle="News, media resources, and how to reach our team."
      sections={[
        {
          heading: 'Media inquiries',
          body: 'For interviews, statements, or brand assets, contact us through the Contact page and mention "Press" in your message. We respond to verified journalists and outlets first.',
        },
        {
          heading: 'About the company',
          body: 'NXQ Social is an independent, trust-first social platform. We focus on authentic connection, verified identity, and a safe community for everyone.',
        },
      ]}
    />
  );
}
