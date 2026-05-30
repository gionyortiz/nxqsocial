import { InfoPage } from '@/components/InfoPage';

export default function HelpPage() {
  return (
    <InfoPage
      title="Help Center"
      subtitle="Answers to common questions and how to get support."
      sections={[
        {
          heading: 'Getting started',
          body: 'Create your profile, add a photo and bio, then start following people and posting. Tap Create to share a photo or reel anytime.',
        },
        {
          heading: 'Getting verified',
          body: 'Open the Verify page from the menu to apply for your Trust Badge. Verification helps people know your account is real.',
        },
        {
          heading: 'Staying safe',
          body: 'You can block any account from their profile, report posts or users, and manage who can contact you from Settings.',
        },
        {
          heading: 'Need more help?',
          body: 'Reach our team from the Contact page and we will get back to you as soon as we can.',
        },
      ]}
    />
  );
}
