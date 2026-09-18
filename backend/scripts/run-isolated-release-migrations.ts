import { spawnSync } from 'node:child_process';
import {
  createIsolatedMigrationJobEnvironment,
  formatIsolatedMigrationJobAuthoritySuccess,
  IsolatedMigrationJobAuthorityError,
  requireIsolatedMigrationJobAuthority,
} from '../src/release/migration-job-authority';
import {
  migrationJobSpawnOptions,
  requireFixedMigrationJobRuntimeLimit,
} from '../src/release/migration-job-runtime-limit';

try {
  const authority = requireIsolatedMigrationJobAuthority(process.env);
  const maxRuntimeMs = requireFixedMigrationJobRuntimeLimit(process.env);
  const migrationEnvironment = createIsolatedMigrationJobEnvironment(
    process.env,
    authority,
  );
  console.log(formatIsolatedMigrationJobAuthoritySuccess(authority));

  // The job image carries the lockfile-pinned Prisma CLI. Resolve its exact
  // installed entry point and invoke Node directly rather than relying on an
  // ambient npx/npm shell environment. This runs only in the one-shot
  // migration service; the API image never receives this URL.
  const prismaCli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    ...migrationJobSpawnOptions(migrationEnvironment),
  });

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      console.error(
        `Lockfile-pinned Prisma migration exceeded the reviewed ${maxRuntimeMs}ms runtime limit.`,
      );
    } else {
      console.error(
        'Unable to start the lockfile-pinned Prisma migration CLI.',
      );
    }
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  if (error instanceof IsolatedMigrationJobAuthorityError) {
    console.error(error.message);
  } else {
    console.error('Isolated migration job validation failed unexpectedly.');
  }
  process.exitCode = 1;
}
