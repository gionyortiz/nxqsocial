import {
  assertSafeSqlIdentifier,
  buildRestoreManifest,
  createTableContentHmacAccumulator,
  validateRestoreManifestConfiguration,
} from './restore-manifest';

const BACKUP_SHA256 = 'd'.repeat(64);

const baseInput = () => ({
  schemaName: 'public',
  sourceBackupSha256: BACKUP_SHA256,
  tables: [
    { tableName: 'User', rowCount: '3', contentHmacSha256: 'b'.repeat(64) },
    { tableName: 'Post', rowCount: 12n, contentHmacSha256: 'c'.repeat(64) },
  ],
  columns: [
    {
      tableName: 'User',
      columnName: 'id',
      dataType: 'text',
      isNullable: false,
      ordinalPosition: 1,
    },
    {
      tableName: 'User',
      columnName: 'email',
      dataType: 'text',
      isNullable: false,
      ordinalPosition: 2,
    },
    {
      tableName: 'Post',
      columnName: 'id',
      dataType: 'text',
      isNullable: false,
      ordinalPosition: 1,
    },
  ],
  migrations: [
    {
      migrationName: '20260822014000_add_email_verification_required',
      checksum: 'a'.repeat(64),
      finishedAt: '2026-08-22T01:40:00.000Z',
      rolledBackAt: null,
    },
  ],
  generatedAt: '2026-08-24T12:00:00.000Z',
});

describe('restore manifest safety', () => {
  it('emits backup identity, content HMACs, counts, and schema identity only', () => {
    const manifest = buildRestoreManifest(baseInput());
    expect(manifest.schema.fingerprintSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.evidenceSha256).toMatch(/^[a-f0-9]{64}$/);

    expect({
      ...manifest,
      evidenceSha256: '<evidence-sha256>',
      schema: {
        ...manifest.schema,
        fingerprintSha256: '<schema-sha256>',
      },
    }).toEqual({
      formatVersion: 2,
      generatedAt: '2026-08-24T12:00:00.000Z',
      databaseEngine: 'postgresql',
      sourceBackupSha256: BACKUP_SHA256,
      evidenceSha256: '<evidence-sha256>',
      schema: {
        name: 'public',
        tableCount: 2,
        columnCount: 3,
        migrationCount: 1,
        appliedMigrationCount: 1,
        failedMigrationCount: 0,
        latestAppliedMigration:
          '20260822014000_add_email_verification_required',
        fingerprintSha256: '<schema-sha256>',
      },
      tables: [
        {
          name: 'Post',
          rowCount: '12',
          contentHmacSha256: 'c'.repeat(64),
        },
        {
          name: 'User',
          rowCount: '3',
          contentHmacSha256: 'b'.repeat(64),
        },
      ],
      privacy: {
        contentComparison: 'keyed-hmac-sha256',
        hmacKeyIncluded: false,
        rowValuesIncluded: false,
        piiValuesIncluded: false,
      },
    });
  });

  it('does not emit PII-bearing metadata, row samples, database URL, or HMAC key', () => {
    const secretKey = 'never-print-this-restore-hmac-key-123456789';
    const serialized = JSON.stringify(buildRestoreManifest(baseInput()));

    expect(serialized).not.toContain('fixture-001@staging.invalid');
    expect(serialized).not.toContain('Synthetic Explorer');
    expect(serialized).not.toContain('"columnName":"email"');
    expect(serialized).not.toContain('rowSample');
    expect(serialized).not.toContain('DATABASE_URL');
    expect(serialized).not.toContain(secretKey);
  });

  it('produces the same schema/evidence fingerprints regardless of inventory order', () => {
    const input = baseInput();
    const reordered = {
      ...input,
      tables: [...input.tables].reverse(),
      columns: [...input.columns].reverse(),
      migrations: [...input.migrations].reverse(),
    };

    expect(buildRestoreManifest(input).schema.fingerprintSha256).toBe(
      buildRestoreManifest(reordered).schema.fingerprintSha256,
    );
    expect(buildRestoreManifest(input).evidenceSha256).toBe(
      buildRestoreManifest(reordered).evidenceSha256,
    );
  });

  it('binds the evidence fingerprint to the exact backup identity', () => {
    const first = buildRestoreManifest(baseInput());
    const second = buildRestoreManifest({
      ...baseInput(),
      sourceBackupSha256: 'e'.repeat(64),
    });

    expect(first.sourceBackupSha256).toBe(BACKUP_SHA256);
    expect(first.evidenceSha256).not.toBe(second.evidenceSha256);
  });

  it('computes deterministic keyed content equivalence without returning rows or key', () => {
    const key = 'independent-restore-hmac-key-1234567890';
    const rows = [
      '{"email":"fixture-001@staging.invalid","id":"user-1"}',
      '{"email":"fixture-002@staging.invalid","id":"user-2"}',
    ];
    const digestFor = (canonicalRows: string[]) => {
      const accumulator = createTableContentHmacAccumulator(
        key,
        'public',
        'User',
      );
      for (const row of canonicalRows) accumulator.update(row);
      return accumulator.digest();
    };

    const digest = digestFor(rows);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).toBe(digestFor(rows));
    expect(digest).not.toBe(
      digestFor([rows[0], '{"email":"changed@staging.invalid","id":"user-2"}']),
    );
    expect(digest).not.toContain(key);
    expect(digest).not.toContain('fixture-001');
  });

  it('requires the backup digest and a 32+ character non-placeholder HMAC key', () => {
    expect(() => validateRestoreManifestConfiguration({})).toThrow(
      'RESTORE_EXPECTED_BACKUP_SHA256',
    );
    expect(() =>
      validateRestoreManifestConfiguration({
        RESTORE_EXPECTED_BACKUP_SHA256: BACKUP_SHA256.toUpperCase(),
        RESTORE_MANIFEST_HMAC_KEY: 'a'.repeat(32),
      }),
    ).toThrow('lowercase 64-character SHA-256 digest');
    expect(() =>
      validateRestoreManifestConfiguration({
        RESTORE_EXPECTED_BACKUP_SHA256: BACKUP_SHA256,
        RESTORE_MANIFEST_HMAC_KEY: 'replace-with-key-value-that-is-long-enough',
      }),
    ).toThrow('non-placeholder value');

    expect(
      validateRestoreManifestConfiguration({
        RESTORE_EXPECTED_BACKUP_SHA256: BACKUP_SHA256,
        RESTORE_MANIFEST_HMAC_KEY: 'valid-independent-hmac-key-123456',
      }),
    ).toEqual({
      expectedBackupSha256: BACKUP_SHA256,
      hmacKey: 'valid-independent-hmac-key-123456',
    });
  });

  it('never includes the backup digest or HMAC key in configuration errors', () => {
    const key = 'never-print-restore-hmac-key-1234567890';
    const digest = 'F'.repeat(64);
    let message = '';
    try {
      validateRestoreManifestConfiguration({
        RESTORE_EXPECTED_BACKUP_SHA256: digest,
        RESTORE_MANIFEST_HMAC_KEY: key,
      });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain(digest);
    expect(message).not.toContain(key);
  });

  it('rejects unsafe identifiers, invalid counts, and invalid content HMACs', () => {
    expect(() => assertSafeSqlIdentifier('User; DROP TABLE User')).toThrow(
      'invalid SQL identifier',
    );
    expect(() =>
      buildRestoreManifest({
        ...baseInput(),
        tables: [
          {
            tableName: 'User',
            rowCount: '-1',
            contentHmacSha256: 'b'.repeat(64),
          },
        ],
      }),
    ).toThrow('row counts must be non-negative integers');
    expect(() =>
      buildRestoreManifest({
        ...baseInput(),
        tables: [
          { tableName: 'User', rowCount: '1', contentHmacSha256: 'invalid' },
        ],
      }),
    ).toThrow('table content HMAC');
  });
});
