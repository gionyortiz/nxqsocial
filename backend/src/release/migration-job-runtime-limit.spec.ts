import {
  MIGRATION_JOB_MAX_RUNTIME_ENV,
  MIGRATION_JOB_MAX_RUNTIME_MS,
  MIGRATION_JOB_TIMEOUT_KILL_SIGNAL,
  migrationJobSpawnOptions,
  requireFixedMigrationJobRuntimeLimit,
} from './migration-job-runtime-limit';

describe('requireFixedMigrationJobRuntimeLimit', () => {
  it('accepts only the reviewed fixed runtime cap', () => {
    expect(
      requireFixedMigrationJobRuntimeLimit({
        [MIGRATION_JOB_MAX_RUNTIME_ENV]: String(MIGRATION_JOB_MAX_RUNTIME_MS),
      }),
    ).toBe(MIGRATION_JOB_MAX_RUNTIME_MS);
  });

  it('fails closed when the cap is absent or altered', () => {
    expect(() => requireFixedMigrationJobRuntimeLimit({})).toThrow(
      MIGRATION_JOB_MAX_RUNTIME_ENV,
    );
    expect(() =>
      requireFixedMigrationJobRuntimeLimit({
        [MIGRATION_JOB_MAX_RUNTIME_ENV]: '3600000',
      }),
    ).toThrow('reviewed');
  });

  it('uses a fixed, non-graceful termination signal for the bounded Prisma child', () => {
    const environment = { PATH: '/safe/path' };

    expect(migrationJobSpawnOptions(environment)).toEqual({
      env: environment,
      stdio: 'inherit',
      timeout: MIGRATION_JOB_MAX_RUNTIME_MS,
      killSignal: MIGRATION_JOB_TIMEOUT_KILL_SIGNAL,
    });
    expect(MIGRATION_JOB_TIMEOUT_KILL_SIGNAL).toBe('SIGKILL');
  });
});
