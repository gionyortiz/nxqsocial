import 'dotenv/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  assertSafeSqlIdentifier,
  buildRestoreManifest,
  createTableContentHmacAccumulator,
  type RestoreColumnMetadata,
  type RestoreMigrationMetadata,
  type RestoreTableInventory,
  validateRestoreManifestConfiguration,
} from '../src/release/restore-manifest';

interface SchemaRow {
  schemaName: string;
}

interface TableRow {
  tableName: string;
}

interface CountRow {
  rowCount: string;
}

interface CanonicalRow {
  canonicalRow: string;
}

interface ColumnRow {
  tableName: string;
  columnName: string;
  dataType: string;
  isNullable: 'YES' | 'NO';
  ordinalPosition: number;
}

interface MigrationRow {
  migrationName: string;
  checksum: string;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

const CONTENT_BATCH_SIZE = 500;

async function main() {
  const configuration = validateRestoreManifestConfiguration(process.env);
  const prisma = new PrismaService();

  try {
    const manifest = await prisma.$transaction(
      async (transaction) => {
        // This must be the first SQL issued inside the snapshot. The explicit
        // database guard complements Prisma's repeatable-read option.
        await transaction.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        await transaction.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
        await transaction.$executeRawUnsafe("SET LOCAL bytea_output = 'hex'");

        const [schema] = await transaction.$queryRawUnsafe<SchemaRow[]>(
          'SELECT current_schema() AS "schemaName"',
        );
        if (!schema?.schemaName) {
          throw new Error('Current PostgreSQL schema could not be identified');
        }
        const quotedSchema = assertSafeSqlIdentifier(schema.schemaName);

        const tableRows = await transaction.$queryRawUnsafe<TableRow[]>(
          [
            'SELECT table_name AS "tableName"',
            'FROM information_schema.tables',
            'WHERE table_schema = current_schema()',
            "AND table_type = 'BASE TABLE'",
            'ORDER BY table_name',
          ].join(' '),
        );

        const tables: RestoreTableInventory[] = [];
        for (const table of tableRows) {
          const quotedTable = assertSafeSqlIdentifier(table.tableName);
          const qualifiedTable = quotedSchema + '.' + quotedTable;
          const [count] = await transaction.$queryRawUnsafe<CountRow[]>(
            'SELECT COUNT(*)::text AS "rowCount" FROM ' + qualifiedTable,
          );
          const rowCount = count?.rowCount ?? '0';
          const contentHmac = createTableContentHmacAccumulator(
            configuration.hmacKey,
            schema.schemaName,
            table.tableName,
          );

          let offset = 0;
          let hashedRows = 0n;
          while (true) {
            const batch = await transaction.$queryRawUnsafe<CanonicalRow[]>(
              [
                'SELECT to_jsonb(t)::text AS "canonicalRow"',
                'FROM ' + qualifiedTable + ' AS t',
                'ORDER BY (to_jsonb(t)::text) COLLATE "C"',
                'LIMIT ' + CONTENT_BATCH_SIZE,
                'OFFSET ' + offset,
              ].join(' '),
            );
            for (const row of batch) {
              contentHmac.update(row.canonicalRow);
              hashedRows += 1n;
            }
            if (batch.length < CONTENT_BATCH_SIZE) break;
            offset += batch.length;
          }

          if (hashedRows !== BigInt(rowCount)) {
            throw new Error(
              'Restore manifest content scan count did not match table count',
            );
          }
          tables.push({
            tableName: table.tableName,
            rowCount,
            contentHmacSha256: contentHmac.digest(),
          });
        }

        const columnRows = await transaction.$queryRawUnsafe<ColumnRow[]>(
          [
            'SELECT table_name AS "tableName",',
            'column_name AS "columnName",',
            'data_type AS "dataType",',
            'is_nullable AS "isNullable",',
            'ordinal_position AS "ordinalPosition"',
            'FROM information_schema.columns',
            'WHERE table_schema = current_schema()',
            'ORDER BY table_name, ordinal_position',
          ].join(' '),
        );
        const columns: RestoreColumnMetadata[] = columnRows.map((column) => ({
          tableName: column.tableName,
          columnName: column.columnName,
          dataType: column.dataType,
          isNullable: column.isNullable === 'YES',
          ordinalPosition: column.ordinalPosition,
        }));

        let migrations: RestoreMigrationMetadata[] = [];
        if (
          tableRows.some((table) => table.tableName === '_prisma_migrations')
        ) {
          migrations = await transaction.$queryRawUnsafe<MigrationRow[]>(
            [
              'SELECT migration_name AS "migrationName",',
              'checksum,',
              'finished_at AS "finishedAt",',
              'rolled_back_at AS "rolledBackAt"',
              'FROM ' + quotedSchema + '."_prisma_migrations"',
              'ORDER BY migration_name',
            ].join(' '),
          );
        }

        return buildRestoreManifest({
          schemaName: schema.schemaName,
          sourceBackupSha256: configuration.expectedBackupSha256,
          tables,
          columns,
          migrations,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 10_000,
        timeout: 600_000,
      },
    );

    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error(
    'Restore manifest generation failed. No database URL, HMAC key, backup identity, or row values were printed.',
  );
  process.exitCode = 1;
});
