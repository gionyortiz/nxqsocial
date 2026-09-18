import {
  formatIsolatedMigrationJobAuthoritySuccess,
  IsolatedMigrationJobAuthorityError,
  requireIsolatedMigrationJobAuthority,
} from '../src/release/migration-job-authority';
import { requireFixedMigrationJobRuntimeLimit } from '../src/release/migration-job-runtime-limit';

try {
  const authority = requireIsolatedMigrationJobAuthority(process.env);
  const maxRuntimeMs = requireFixedMigrationJobRuntimeLimit(process.env);
  console.log(formatIsolatedMigrationJobAuthoritySuccess(authority));
  console.log(`Reviewed migration job runtime limit: ${maxRuntimeMs}ms.`);
} catch (error) {
  if (error instanceof IsolatedMigrationJobAuthorityError) {
    console.error(error.message);
  } else {
    console.error('Isolated migration job validation failed unexpectedly.');
  }
  process.exitCode = 1;
}
