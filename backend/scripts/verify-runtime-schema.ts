import { spawnSync } from 'node:child_process';
import {
  createRuntimeSchemaVerificationEnvironment,
  formatRuntimeSchemaVerificationSuccess,
  RuntimeSchemaAuthorityError,
  requireRuntimeSchemaAuthority,
} from '../src/release/runtime-schema-authority';

try {
  const authority = requireRuntimeSchemaAuthority(process.env);
  const verificationEnvironment = createRuntimeSchemaVerificationEnvironment(
    process.env,
    authority,
  );
  // Use the image's resolved Prisma CLI rather than npx/npm so this read-only
  // verifier works with the same minimal environment as the migration job.
  const prismaCli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'status'], {
    encoding: 'utf8',
    env: verificationEnvironment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error || result.status !== 0) {
    console.error(
      'Runtime schema is not verified. Run the isolated migration job to success, then retry the API deployment.',
    );
    process.exitCode = 1;
  } else {
    console.log(formatRuntimeSchemaVerificationSuccess(authority));
  }
} catch (error) {
  if (error instanceof RuntimeSchemaAuthorityError) {
    console.error(error.message);
  } else {
    console.error('Runtime schema verification failed unexpectedly.');
  }
  process.exitCode = 1;
}
