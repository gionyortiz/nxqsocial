/**
 * Jest global setup — runs once before all E2E test suites.
 *
 * Sets DATABASE_URL to the test database (DATABASE_URL_TEST env var).
 * If DATABASE_URL_TEST is not set, the tests will fall back to DATABASE_URL
 * (dev DB) and print a warning.
 *
 * IMPORTANT: Before running E2E tests, apply migrations to the test DB:
 *   $env:DATABASE_URL = $env:DATABASE_URL_TEST
 *   npx prisma migrate deploy
 */
export default async function globalSetup() {
  const testDbUrl =
    process.env.DATABASE_URL_TEST ??
    'postgresql://postgres:postgres@localhost:5432/nexasocial_test';

  // Override DATABASE_URL so Prisma uses the test DB for all E2E tests
  process.env.DATABASE_URL = testDbUrl;

  // Set a known Stripe webhook secret for E2E tests
  if (!process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_REPLACE')) {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_test_secret_nexasocial';
  }

  // Silence noisy env warnings during tests
  process.env.NODE_ENV = 'test';

  console.log(`[E2E] Using test database: ${testDbUrl.replace(/:[^@]+@/, ':***@')}`);
}
