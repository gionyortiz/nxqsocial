import {
  formatRuntimeSchemaAuthoritySuccess,
  RuntimeSchemaAuthorityError,
  requireRuntimeSchemaAuthority,
} from '../src/release/runtime-schema-authority';

try {
  const authority = requireRuntimeSchemaAuthority(process.env);
  console.log(formatRuntimeSchemaAuthoritySuccess(authority));
} catch (error) {
  if (error instanceof RuntimeSchemaAuthorityError) {
    console.error(error.message);
  } else {
    console.error('Runtime schema authority validation failed unexpectedly.');
  }
  process.exitCode = 1;
}
