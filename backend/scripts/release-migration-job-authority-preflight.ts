import {
  formatIsolatedMigrationJobAuthoritySuccess,
  IsolatedMigrationJobAuthorityError,
  requireIsolatedMigrationJobAuthority,
} from '../src/release/migration-job-authority';

try {
  const authority = requireIsolatedMigrationJobAuthority(process.env);
  console.log(formatIsolatedMigrationJobAuthoritySuccess(authority));
} catch (error) {
  if (error instanceof IsolatedMigrationJobAuthorityError) {
    console.error(error.message);
  } else {
    console.error('Isolated migration job validation failed unexpectedly.');
  }
  process.exitCode = 1;
}
