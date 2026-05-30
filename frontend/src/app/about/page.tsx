import { InfoPage } from '@/components/InfoPage';

export default function AboutPage() {
  return (
    <InfoPage
      title="About NXQ Social"
      subtitle="A trust-first social network built for real people and real connections."
      sections={[
        {
          heading: 'Our mission',
          body: 'NXQ Social exists to make online connection safer and more genuine. We put trust and verification at the center of the experience, so you always know who you are talking to.',
        },
        {
          heading: 'What makes us different',
          body: 'Every profile can earn a verified Trust Badge. Our Trust Engine rewards authentic activity and helps reduce spam, fake accounts, and harassment.',
        },
        {
          heading: 'Share what matters',
          body: 'Post photos, share reels, go live on voice and video calls, and grow a community that respects you. NXQ is built to be simple, beautiful, and safe for everyone.',
        },
      ]}
    />
  );
}
