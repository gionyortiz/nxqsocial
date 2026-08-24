import 'dotenv/config';
import {
  formatReleaseProviderPreflightSuccess,
  ReleaseProviderPreflightError,
  validateFullStagingReleaseProviders,
} from '../src/release/release-provider-preflight';

try {
  const result = validateFullStagingReleaseProviders(process.env);
  console.log(formatReleaseProviderPreflightSuccess(result));
} catch (error) {
  if (error instanceof ReleaseProviderPreflightError) {
    console.error(error.message);
    process.exitCode = 1;
  } else {
    console.error('Full staging provider preflight failed unexpectedly.');
    process.exitCode = 1;
  }
}
