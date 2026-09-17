import { spawnSync } from 'node:child_process';
import {
  createMigrationCommandEnvironment,
  formatReleaseMigrationAuthoritySuccess,
  ReleaseMigrationAuthorityError,
  requireReleaseMigrationAuthority,
} from '../src/release/migration-authority';

try {
  const authority = requireReleaseMigrationAuthority(process.env);
  const migrationEnvironment = createMigrationCommandEnvironment(
    process.env,
    authority,
  );
  console.log(formatReleaseMigrationAuthoritySuccess(authority));

  // `--no-install` guarantees the release image's lockfile-pinned Prisma CLI
  // is used; it cannot fetch a package during a deployment. DATABASE_URL is
  // overridden only in this child environment, never in the API runtime.
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['--no-install', 'prisma', 'migrate', 'deploy'],
    {
      env: migrationEnvironment,
      stdio: 'inherit',
    },
  );

  if (result.error) {
    console.error('Unable to start the lockfile-pinned Prisma migration CLI.');
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  if (error instanceof ReleaseMigrationAuthorityError) {
    console.error(error.message);
  } else {
    console.error(
      'Release migration authority validation failed unexpectedly.',
    );
  }
  process.exitCode = 1;
}
