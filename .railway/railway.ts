import {
  createRailwayContext,
  database,
  defineRailway,
  github,
  project,
  redis,
  service,
  volume,
} from "railway/iac";

const EXPECTED_PROJECT_ID = "1cf84772-c0bd-44a6-bd6c-f652955ac0d8";
const EXPECTED_PROJECT_NAME = "nxq-social-staging";
const EXPECTED_ENVIRONMENT_ID = "6f3d73f8-2712-4736-9b4b-8383ec21cac3";
const EXPECTED_ENVIRONMENT_NAME = "staging";
const STAGING_BRANCH = "release/railway-staging-20260823";
const SOURCE_REPOSITORY = "gionyortiz/nxqsocial";

export default defineRailway((ctx) => {
  const targetProjectId =
    ctx.projectId ?? process.env.NXQ_RAILWAY_IAC_PROJECT_ID;
  const targetProjectName =
    ctx.projectName ?? process.env.NXQ_RAILWAY_IAC_PROJECT_NAME;
  const targetEnvironmentId =
    ctx.environmentId ?? process.env.NXQ_RAILWAY_IAC_ENVIRONMENT_ID;
  const targetEnvironment =
    ctx.environment ??
    ctx.environmentName ??
    process.env.NXQ_RAILWAY_IAC_ENVIRONMENT_NAME;
  if (
    targetProjectId !== EXPECTED_PROJECT_ID ||
    targetProjectName !== EXPECTED_PROJECT_NAME ||
    targetEnvironmentId !== EXPECTED_ENVIRONMENT_ID ||
    targetEnvironment !== EXPECTED_ENVIRONMENT_NAME
  ) {
    throw new Error(
      "This configuration requires the exact NXQ Social staging project and environment context.",
    );
  }
  // Railway CLI currently omits the SDK's optional `shared` proxy from the
  // evaluation context. Recreate only that standard reference proxy after the
  // exact project/environment identity above has passed.
  const shared = ctx.shared ?? createRailwayContext({}).shared;

  const Redis = redis("Redis", { region: "us-west2" });
  Redis.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  const Postgres = database("Postgres", "postgres", {
    image: "ghcr.io/railwayapp-templates/postgres-ssl:16",
    region: "us-west2",
  });
  const postgresVolume = volume("postgres-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });
  const redisVolume = volume("redis-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });

  const backend = service("backend", {
    source: github(SOURCE_REPOSITORY, {
      branch: STAGING_BRANCH,
      checkSuites: true,
      rootDirectory: "backend",
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      preDeployCommand:
        "node dist/scripts/release-provider-preflight.js && npm run db:migrate:deploy",
      healthcheckPath: "/api/health/ready",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      drainingSeconds: 20,
    },
    replicas: { "us-west2": 1 },
    env: {
      NODE_ENV: "production",
      NXQ_RELEASE_TARGET: "staging",
      APP_BASE_URL: "https://staging.nxqsocial.com",
      FRONTEND_URL: "https://staging.nxqsocial.com",
      API_BASE_URL: "https://api-staging.nxqsocial.com/api",
      DATABASE_URL: Postgres.env.DATABASE_URL,
      REDIS_URL: Redis.env.REDIS_URL,
      JWT_SECRET: shared.JWT_SECRET,
      JWT_EXPIRES_IN: "7d",
      OTP_PEPPER: shared.OTP_PEPPER,
      SIGNUP_HARDENING_ENABLED: "true",
      TURNSTILE_TEST_BYPASS: "false",
      TURNSTILE_SECRET_KEY: shared.TURNSTILE_SECRET_KEY,
      TURNSTILE_ALLOWED_HOSTNAMES: "staging.nxqsocial.com",
      S3_ENDPOINT:
        "https://07a14429304a4b400dfcaf6d09213b6e.r2.cloudflarestorage.com",
      S3_BUCKET_NAME: "nxqsocial-staging-public",
      S3_QUARANTINE_BUCKET: "nxqsocial-staging-quarantine",
      S3_PUBLIC_BASE_URL: "https://media-staging.nxqsocial.com",
      AWS_ACCESS_KEY_ID: shared.AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: shared.AWS_SECRET_ACCESS_KEY,
      AWS_REGION: "auto",
      MEDIA_MODERATION_PROVIDER: "staging-mock",
      RESEND_API_KEY: shared.RESEND_API_KEY,
      EMAIL_FROM: shared.EMAIL_FROM,
      STRIPE_SECRET_KEY: shared.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: shared.STRIPE_WEBHOOK_SECRET,
      LIVEKIT_URL: shared.LIVEKIT_URL,
      LIVEKIT_EXPECTED_STAGING_URL: shared.LIVEKIT_URL,
      LIVEKIT_API_KEY: shared.LIVEKIT_API_KEY,
      LIVEKIT_API_SECRET: shared.LIVEKIT_API_SECRET,
    },
  });

  const frontend = service("frontend", {
    source: github(SOURCE_REPOSITORY, {
      branch: STAGING_BRANCH,
      checkSuites: true,
      rootDirectory: "frontend",
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      healthcheckPath: "/health",
      healthcheckTimeout: 300,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 5,
      drainingSeconds: 20,
    },
    replicas: { "us-west2": 1 },
    env: {
      NODE_ENV: "production",
      NXQ_RELEASE_TARGET: "staging",
      NEXT_PUBLIC_APP_URL: "https://staging.nxqsocial.com",
      NEXT_PUBLIC_API_URL: "https://api-staging.nxqsocial.com/api",
      NEXT_PUBLIC_CALLS_ENABLED: "true",
      NEXT_PUBLIC_LIVE_ENABLED: "true",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: shared.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    },
  });

  return project(EXPECTED_PROJECT_NAME, {
    resources: [
      Redis,
      Postgres,
      postgresVolume,
      redisVolume,
      backend,
      frontend,
    ],
  });
});
