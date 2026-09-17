import {
  formatReleaseMigrationAuthoritySuccess,
  ReleaseMigrationAuthorityError,
  requireReleaseMigrationAuthority,
} from '../src/release/migration-authority';

try {
  const authority = requireReleaseMigrationAuthority(process.env);
  console.log(formatReleaseMigrationAuthoritySuccess(authority));
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
