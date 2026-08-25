export const NXQ_SOCIAL_STAGING_TARGET = {
  railway: {
    projectId: '1cf84772-c0bd-44a6-bd6c-f652955ac0d8',
    environmentId: '6f3d73f8-2712-4736-9b4b-8383ec21cac3',
    environmentName: 'staging',
  },
  application: {
    frontendOrigin: 'https://staging.nxqsocial.com',
    apiBaseUrl: 'https://api-staging.nxqsocial.com/api',
  },
  resources: {
    r2Endpoint:
      'https://07a14429304a4b400dfcaf6d09213b6e.r2.cloudflarestorage.com',
    publicBucket: 'nxqsocial-staging-public',
    quarantineBucket: 'nxqsocial-staging-quarantine',
    moderationBucket: 'nxqsocial-staging-moderation-private',
    publicMediaOrigin: 'https://media-staging.nxqsocial.com',
    turnstileHostname: 'staging.nxqsocial.com',
    emailDomain: 'staging.nxqsocial.com',
  },
} as const;
