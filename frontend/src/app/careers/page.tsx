import { InfoPage } from '@/components/InfoPage';

export default function CareersPage() {
  return (
    <InfoPage
      title="Careers"
      subtitle="Help us build a safer, more genuine social network."
      sections={[
        {
          heading: 'Work with us',
          body: 'We are a small, focused team that cares deeply about trust, safety, and great design. We hire people who are kind, curious, and take ownership of their work.',
        },
        {
          heading: 'Open roles',
          body: 'We are always interested in talented engineers, designers, and community specialists. If that sounds like you, reach out through the Contact page and tell us what you would love to work on.',
        },
      ]}
    />
  );
}
