import { createHash, createHmac, type Hmac } from 'crypto';

type RestoreEnvironment = Record<string, string | undefined>;

export interface RestoreTableInventory {
  tableName: string;
  rowCount: string | number | bigint;
  contentHmacSha256: string;
}

export interface RestoreColumnMetadata {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: boolean;
  ordinalPosition: number;
}

export interface RestoreMigrationMetadata {
  migrationName: string;
  checksum: string;
  finishedAt: Date | string | null;
  rolledBackAt: Date | string | null;
}

export interface RestoreManifestConfiguration {
  expectedBackupSha256: string;
  hmacKey: string;
}

export interface RestoreManifest {
  formatVersion: 2;
  generatedAt: string;
  databaseEngine: 'postgresql';
  sourceBackupSha256: string;
  evidenceSha256: string;
  schema: {
    name: string;
    tableCount: number;
    columnCount: number;
    migrationCount: number;
    appliedMigrationCount: number;
    failedMigrationCount: number;
    latestAppliedMigration: string | null;
    fingerprintSha256: string;
  };
  tables: Array<{
    name: string;
    rowCount: string;
    contentHmacSha256: string;
  }>;
  privacy: {
    contentComparison: 'keyed-hmac-sha256';
    hmacKeyIncluded: false;
    rowValuesIncluded: false;
    piiValuesIncluded: false;
  };
}

interface BuildRestoreManifestInput {
  schemaName: string;
  sourceBackupSha256: string;
  tables: readonly RestoreTableInventory[];
  columns: readonly RestoreColumnMetadata[];
  migrations: readonly RestoreMigrationMetadata[];
  generatedAt?: Date | string;
}

export interface TableContentHmacAccumulator {
  update(canonicalRow: string): void;
  digest(): string;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MIGRATION_NAME = /^[A-Za-z0-9_-]+$/;
const TYPE_NAME = /^[A-Za-z0-9_ .()[\],"-]+$/;
const SHA256_LOWERCASE = /^[a-f0-9]{64}$/;
const PLACEHOLDER =
  /change[-_ ]?me|replace(?:[-_ ]?with)?|placeholder|__required__|\.\.\.$/i;

export function validateRestoreManifestConfiguration(
  environment: RestoreEnvironment,
): RestoreManifestConfiguration {
  const expectedBackupSha256 = environment.RESTORE_EXPECTED_BACKUP_SHA256 ?? '';
  if (!SHA256_LOWERCASE.test(expectedBackupSha256)) {
    throw new Error(
      'RESTORE_EXPECTED_BACKUP_SHA256 must be a lowercase 64-character SHA-256 digest',
    );
  }

  const hmacKey = environment.RESTORE_MANIFEST_HMAC_KEY ?? '';
  if (
    Array.from(hmacKey).length < 32 ||
    !hmacKey.trim() ||
    PLACEHOLDER.test(hmacKey)
  ) {
    throw new Error(
      'RESTORE_MANIFEST_HMAC_KEY must be a non-placeholder value of at least 32 characters',
    );
  }

  return { expectedBackupSha256, hmacKey };
}

/**
 * Create a domain-separated HMAC accumulator for canonical database rows.
 * Length-prefixing every row prevents ambiguous concatenations. The key and
 * row values are retained only in process memory and are never returned.
 */
export function createTableContentHmacAccumulator(
  hmacKey: string,
  schemaName: string,
  tableName: string,
): TableContentHmacAccumulator {
  if (Array.from(hmacKey).length < 32) {
    throw new Error('RESTORE_MANIFEST_HMAC_KEY must be at least 32 characters');
  }
  assertIdentifier(schemaName, 'schema name');
  assertIdentifier(tableName, 'table name');

  const hmac = createHmac('sha256', hmacKey);
  updateFramedValue(hmac, 'nxq-social-restore-manifest-content-v1');
  updateFramedValue(hmac, schemaName);
  updateFramedValue(hmac, tableName);
  let finalized = false;

  return {
    update(canonicalRow: string) {
      if (finalized) {
        throw new Error('Restore table content HMAC is already finalized');
      }
      updateFramedValue(hmac, canonicalRow);
    },
    digest() {
      if (finalized) {
        throw new Error('Restore table content HMAC is already finalized');
      }
      finalized = true;
      return hmac.digest('hex');
    },
  };
}

/**
 * Build a restore verification artifact from counts, schema metadata, and
 * already-keyed per-table content HMACs. No table row, database URL, HMAC key,
 * username, email, phone, or other application value is accepted or emitted.
 */
export function buildRestoreManifest(
  input: BuildRestoreManifestInput,
): RestoreManifest {
  assertIdentifier(input.schemaName, 'schema name');
  if (!SHA256_LOWERCASE.test(input.sourceBackupSha256)) {
    throw new Error(
      'Restore manifest source backup identity must be a lowercase SHA-256 digest',
    );
  }

  const tables = input.tables
    .map((table) => {
      assertIdentifier(table.tableName, 'table name');
      if (!SHA256_LOWERCASE.test(table.contentHmacSha256)) {
        throw new Error(
          'Restore manifest table content HMAC must be a lowercase SHA-256 digest',
        );
      }
      return {
        name: table.tableName,
        rowCount: normalizeCount(table.rowCount),
        contentHmacSha256: table.contentHmacSha256,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  if (new Set(tables.map((table) => table.name)).size !== tables.length) {
    throw new Error('Restore manifest table inventory contains duplicates');
  }

  const columns = input.columns
    .map((column) => {
      assertIdentifier(column.tableName, 'column table name');
      assertIdentifier(column.columnName, 'column name');
      if (!TYPE_NAME.test(column.dataType)) {
        throw new Error(
          'Restore manifest contains invalid column type metadata',
        );
      }
      if (
        !Number.isInteger(column.ordinalPosition) ||
        column.ordinalPosition < 1
      ) {
        throw new Error(
          'Restore manifest column ordinal positions must be positive integers',
        );
      }
      return {
        tableName: column.tableName,
        columnName: column.columnName,
        dataType: column.dataType,
        isNullable: column.isNullable,
        ordinalPosition: column.ordinalPosition,
      };
    })
    .sort(
      (left, right) =>
        left.tableName.localeCompare(right.tableName) ||
        left.ordinalPosition - right.ordinalPosition ||
        left.columnName.localeCompare(right.columnName),
    );

  const migrations = input.migrations
    .map((migration) => {
      if (!MIGRATION_NAME.test(migration.migrationName)) {
        throw new Error('Restore manifest contains an invalid migration name');
      }
      if (!SHA256_LOWERCASE.test(migration.checksum)) {
        throw new Error(
          'Restore manifest contains an invalid migration checksum',
        );
      }
      return {
        migrationName: migration.migrationName,
        checksum: migration.checksum,
        finishedAt: normalizeOptionalDate(migration.finishedAt),
        rolledBackAt: normalizeOptionalDate(migration.rolledBackAt),
      };
    })
    .sort((left, right) =>
      left.migrationName.localeCompare(right.migrationName),
    );

  const appliedMigrations = migrations
    .filter((migration) => migration.finishedAt && !migration.rolledBackAt)
    .sort((left, right) => left.finishedAt!.localeCompare(right.finishedAt!));
  const failedMigrationCount = migrations.filter(
    (migration) => !migration.finishedAt && !migration.rolledBackAt,
  ).length;
  const latestAppliedMigration =
    appliedMigrations.at(-1)?.migrationName ?? null;

  const schemaFingerprintInput = JSON.stringify({
    schemaName: input.schemaName,
    tables: tables.map((table) => table.name),
    columns,
    migrations: migrations.map(({ migrationName, checksum }) => ({
      migrationName,
      checksum,
    })),
  });
  const fingerprintSha256 = sha256(schemaFingerprintInput);
  const evidenceSha256 = sha256(
    JSON.stringify({
      sourceBackupSha256: input.sourceBackupSha256,
      fingerprintSha256,
      tables,
    }),
  );

  return {
    formatVersion: 2,
    generatedAt: normalizeDate(input.generatedAt ?? new Date()),
    databaseEngine: 'postgresql',
    sourceBackupSha256: input.sourceBackupSha256,
    evidenceSha256,
    schema: {
      name: input.schemaName,
      tableCount: tables.length,
      columnCount: columns.length,
      migrationCount: migrations.length,
      appliedMigrationCount: appliedMigrations.length,
      failedMigrationCount,
      latestAppliedMigration,
      fingerprintSha256,
    },
    tables,
    privacy: {
      contentComparison: 'keyed-hmac-sha256',
      hmacKeyIncluded: false,
      rowValuesIncluded: false,
      piiValuesIncluded: false,
    },
  };
}

export function assertSafeSqlIdentifier(identifier: string): string {
  assertIdentifier(identifier, 'SQL identifier');
  return '"' + identifier + '"';
}

function updateFramedValue(hmac: Hmac, value: string) {
  const bytes = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  hmac.update(length);
  hmac.update(bytes);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function assertIdentifier(value: string, label: string) {
  if (!IDENTIFIER.test(value)) {
    throw new Error('Restore manifest contains an invalid ' + label);
  }
}

function normalizeCount(value: string | number | bigint): string {
  const text = String(value);
  if (!/^(?:0|[1-9]\d*)$/.test(text)) {
    throw new Error(
      'Restore manifest row counts must be non-negative integers',
    );
  }
  return text;
}

function normalizeOptionalDate(value: Date | string | null): string | null {
  return value === null ? null : normalizeDate(value);
}

function normalizeDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Restore manifest contains invalid date metadata');
  }
  return date.toISOString();
}
