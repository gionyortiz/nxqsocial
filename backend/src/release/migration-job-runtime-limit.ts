import type { SpawnSyncOptions } from 'node:child_process';

type ReleaseEnvironment = Record<string, string | undefined>;

export const MIGRATION_JOB_MAX_RUNTIME_MS = 10 * 60 * 1_000;
export const MIGRATION_JOB_MAX_RUNTIME_ENV = 'MIGRATION_JOB_MAX_RUNTIME_MS';
// Railway runs this job in a Linux container, where SIGKILL cannot be caught
// or ignored by the direct Prisma child process. Provider-side exit and cost
// confirmation remain required after the process terminates.
export const MIGRATION_JOB_TIMEOUT_KILL_SIGNAL: NodeJS.Signals = 'SIGKILL';

/**
 * Keep the job timeout source-controlled. A Railway shared variable must not
 * be able to increase the migration job's permitted runtime after review.
 */
export function requireFixedMigrationJobRuntimeLimit(
  environment: ReleaseEnvironment,
): number {
  if (
    environment[MIGRATION_JOB_MAX_RUNTIME_ENV] !==
    String(MIGRATION_JOB_MAX_RUNTIME_MS)
  ) {
    throw new Error(
      `${MIGRATION_JOB_MAX_RUNTIME_ENV} must equal the reviewed ${MIGRATION_JOB_MAX_RUNTIME_MS}ms limit`,
    );
  }
  return MIGRATION_JOB_MAX_RUNTIME_MS;
}

/** Keep the runtime bound and termination behavior source-controlled. */
export function migrationJobSpawnOptions(
  environment: NodeJS.ProcessEnv,
): SpawnSyncOptions {
  return {
    env: environment,
    stdio: 'inherit' as const,
    timeout: MIGRATION_JOB_MAX_RUNTIME_MS,
    killSignal: MIGRATION_JOB_TIMEOUT_KILL_SIGNAL,
  };
}
