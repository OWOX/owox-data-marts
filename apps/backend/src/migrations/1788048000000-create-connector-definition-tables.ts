import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const CONNECTOR_DEFINITION = 'connector_definition';
const CONNECTOR_DEFINITION_VERSION = 'connector_definition_version';

const CONNECTOR_DEFINITION_INDICES = [
  'IDX_connector_definition_projectId',
  'IDX_connector_definition_projectId_name',
];
const CONNECTOR_DEFINITION_VERSION_INDICES = [
  'IDX_connector_definition_version_definitionId',
  'IDX_connector_definition_version_definitionId_version',
];

/**
 * Custom (no-code) connector definitions and their manifest versions.
 *
 * Every schema object is created behind its own existence guard: MySQL commits DDL
 * implicitly, so a pod that dies mid-migration leaves committed objects behind with no
 * migration row, and the next pod re-runs up() from the top. Without the guards the re-run
 * dies on a duplicate name and the migration becomes permanently unrunnable.
 *
 * The guards are deliberately per object rather than one hasTable() around each block. A
 * pod that dies between createTable() and the createIndex()/createForeignKey() calls that
 * follow it commits the table alone; a re-run keyed off the table would then take the
 * whole block as done and leave that table without its unique constraint and foreign key
 * for good, with nothing to signal it.
 *
 * The only foreign key points at this module's own table and is NO ACTION: connector
 * definitions are soft-deleted, never hard-deleted, so a cascade would be a bug.
 */
export class CreateConnectorDefinitionTables1788048000000 implements MigrationInterface {
  name = 'CreateConnectorDefinitionTables1788048000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable(CONNECTOR_DEFINITION))) {
      await queryRunner.createTable(
        new Table({
          name: CONNECTOR_DEFINITION,
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'projectId', type: 'varchar', isNullable: false },
            { name: 'name', type: 'varchar', isNullable: false },
            { name: 'title', type: 'varchar', isNullable: false },
            { name: 'description', type: 'text', isNullable: true, default: null },
            { name: 'logo', type: 'text', isNullable: true, default: null },
            { name: 'docUrl', type: 'varchar', isNullable: true, default: null },
            { name: 'activeVersionId', type: 'varchar', isNullable: true, default: null },
            { name: 'createdById', type: 'varchar', isNullable: true, default: null },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'deletedAt', type: 'datetime', isNullable: true, default: null },
          ],
        })
      );
    }

    await createIndexIfMissing(
      queryRunner,
      CONNECTOR_DEFINITION,
      new TableIndex({
        name: 'IDX_connector_definition_projectId',
        columnNames: ['projectId'],
      })
    );
    await createIndexIfMissing(
      queryRunner,
      CONNECTOR_DEFINITION,
      new TableIndex({
        name: 'IDX_connector_definition_projectId_name',
        columnNames: ['projectId', 'name'],
        isUnique: true,
      })
    );

    if (!(await queryRunner.hasTable(CONNECTOR_DEFINITION_VERSION))) {
      await queryRunner.createTable(
        new Table({
          name: CONNECTOR_DEFINITION_VERSION,
          columns: [
            { name: 'id', type: 'varchar', isPrimary: true },
            { name: 'connectorDefinitionId', type: 'varchar', isNullable: false },
            { name: 'version', type: 'integer', isNullable: false },
            { name: 'manifest', type: 'json', isNullable: false },
            { name: 'status', type: 'varchar', default: "'draft'" },
            { name: 'createdById', type: 'varchar', isNullable: true, default: null },
            { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
            { name: 'publishedAt', type: 'datetime', isNullable: true, default: null },
          ],
        })
      );
    }

    await createIndexIfMissing(
      queryRunner,
      CONNECTOR_DEFINITION_VERSION,
      new TableIndex({
        name: 'IDX_connector_definition_version_definitionId',
        columnNames: ['connectorDefinitionId'],
      })
    );
    // saveDraft() derives the next version number from the current latest row, so two
    // concurrent saves compute the same number. The database is what keeps them apart.
    await createIndexIfMissing(
      queryRunner,
      CONNECTOR_DEFINITION_VERSION,
      new TableIndex({
        name: 'IDX_connector_definition_version_definitionId_version',
        columnNames: ['connectorDefinitionId', 'version'],
        isUnique: true,
      })
    );
    await createForeignKeyIfMissing(
      queryRunner,
      CONNECTOR_DEFINITION_VERSION,
      new TableForeignKey({
        columnNames: ['connectorDefinitionId'],
        referencedTableName: CONNECTOR_DEFINITION,
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse dependency order so the foreign key goes before what it references.
    await softDropTableWithIndices(
      queryRunner,
      CONNECTOR_DEFINITION_VERSION,
      CONNECTOR_DEFINITION_VERSION_INDICES
    );
    await softDropTableWithIndices(queryRunner, CONNECTOR_DEFINITION, CONNECTOR_DEFINITION_INDICES);
  }
}

/**
 * Creates an index unless the live table already carries one under that name.
 *
 * The table is re-read rather than assumed from the createTable() above, so the check
 * holds equally on the first run and on a re-run that found the table already committed.
 */
async function createIndexIfMissing(
  queryRunner: QueryRunner,
  table: string,
  index: TableIndex
): Promise<void> {
  const loadedTable = await queryRunner.getTable(table);
  if ((loadedTable?.indices ?? []).some(existing => existing.name === index.name)) {
    return;
  }

  await queryRunner.createIndex(loadedTable ?? table, index);
}

/**
 * Creates a foreign key unless the live table already constrains the same columns.
 *
 * Matched on the constrained columns rather than on a name: this key is declared without
 * one, so each driver invents its own, and a name comparison would recreate the key on
 * every re-run.
 */
async function createForeignKeyIfMissing(
  queryRunner: QueryRunner,
  table: string,
  foreignKey: TableForeignKey
): Promise<void> {
  const loadedTable = await queryRunner.getTable(table);
  const columns = foreignKey.columnNames.join(',');
  const alreadyConstrained = (loadedTable?.foreignKeys ?? []).some(
    existing => existing.columnNames.join(',') === columns
  );
  if (alreadyConstrained) {
    return;
  }

  await queryRunner.createForeignKey(loadedTable ?? table, foreignKey);
}

/**
 * softDropTable() renames a table instead of dropping it, and SQLite keeps user-named
 * indexes attached to the renamed table under their original, database-scoped names.
 * Dropping this migration's own indexes first frees those names so a later up() can
 * recreate them; the backup table keeps every row, which is all it is there for.
 *
 * The foreign keys go before the indexes, never after. Both version indexes cover
 * `connectorDefinitionId` and so does the foreign key, and MySQL requires an index whose
 * leftmost prefix covers a key's columns for as long as that key exists -- so dropping
 * them with the key still in place makes whichever goes second the last one covering it
 * and raises ERROR 1553, "Cannot drop index ...: needed in a foreign key constraint".
 * TypeORM's MySQL dropIndex() is a bare ALTER TABLE ... DROP INDEX with no foreign-key
 * handling of its own. down() would then abort half-way with one index already gone, and
 * because TypeORM deletes the migrations row only once down() resolves, the row would
 * survive and nothing would re-run to repair the schema.
 */
async function softDropTableWithIndices(
  queryRunner: QueryRunner,
  table: string,
  indices: string[]
): Promise<void> {
  if (!(await queryRunner.hasTable(table))) {
    return;
  }

  const loadedTable = await queryRunner.getTable(table);
  // Snapshot both first: each drop mutates the list it is read from as it goes.
  const ownForeignKeys = [...(loadedTable?.foreignKeys ?? [])];
  const ownIndices = (loadedTable?.indices ?? []).filter(
    index => index.name && indices.includes(index.name)
  );

  for (const foreignKey of ownForeignKeys) {
    await queryRunner.dropForeignKey(loadedTable ?? table, foreignKey);
  }

  for (const index of ownIndices) {
    await queryRunner.dropIndex(loadedTable ?? table, index);
  }

  await softDropTable(queryRunner, table);
}
