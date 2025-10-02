# OWOX Data Marts Migration Guidelines

## General Principles

- The TypeORM `synchronize` option **must be set to `false`**. This is required
  to prevent data loss and uncontrolled schema changes.
- All schema changes (creating, altering, or dropping tables and columns) must
  be implemented via migrations.
- For schema (DDL) changes, use the **declarative migration style** (e.g., via
  `Table`, `TableColumn`, etc.) to ensure compatibility with both MySQL and
  SQLite.
- For data (DML) changes, use SQL queries (`queryRunner.query`). Minimize their
  use and ensure all queries are cross-database compatible.
- All migrations must be compatible with both MySQL and SQLite.
- All migration files are located in the `/src/migrations` directory and must be
  named with a leading timestamp (e.g., `1680000000000-AddUserTable.ts`).
- Migrations can be executed automatically on NestJS application startup if the
  environment variable `RUN_MIGRATIONS` is set to `true`.

## Creating a Migration Template

To generate a migration template, use the following command:

```bash
npm run migration:create-template <MigrationName>
```

Where `<MigrationName>` is the desired name for your migration (e.g.,
`AddUserTable`).

## Running and Reverting Migrations

- To run all pending migrations:

  ```bash
  npm run migration:run
  ```

- To revert the last executed migration:

  ```bash
  npm run migration:revert
  ```

## Example: Declarative Migration (DDL)

```ts
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class AddUserTable1680000000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar' },
        ],
      })
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user');
  }
}
```

## Example: Data Migration (DML)

```ts
await queryRunner.query("UPDATE table_name SET status = 'run' WHERE status = 'active'");
```

> **Note:** Write DML queries to be compatible with both MySQL and SQLite.
