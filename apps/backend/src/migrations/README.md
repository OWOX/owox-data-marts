# Migration Guidelines

Database migrations are version-controlled scripts that manage changes to your database schema and data over time. They ensure that all environments (development, staging, production) maintain consistent database structure and allow for safe, repeatable deployments.

In OWOX Data Marts, migrations handle:

- Creating, altering, or dropping database tables and columns
- Modifying indexes and constraints
- Data transformation during schema changes
- Ensuring compatibility across MySQL and SQLite databases

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
  named with a leading timestamp(e.g., `1680000000000-add-user-table.ts`).
- Migrations can be executed automatically on NestJS application startup if the
  environment variable `RUN_MIGRATIONS` is set to `true`.

## Development Workflow

> **Important**: All npm scripts must be executed from the monorepo root directory. These scripts internally use OWOX CLI, so both `owox` and `backend` packages must be built before working with migrations.

### Creating a Migration Template

To generate a migration template, use the following command:

```bash
npm run migrations:create-template <MigrationName>
```

Where `<MigrationName>` is the desired name for your migration (e.g.,
`add-user-table`).

### Working with Migrations

- To check migrations status:

  ```bash
  npm run migrations:status
  ```

- To run all pending migrations:

  ```bash
  npm run migrations:up
  ```

- To revert the last executed migration:

  ```bash
  npm run migrations:down
  ```

## Migration Examples

### Declarative Migration (DDL)

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

### Data Migration (DML)

```ts
await queryRunner.query("UPDATE table_name SET status = 'run' WHERE status = 'active'");
```

> **Note:** Write DML queries to be compatible with both MySQL and SQLite.

## Best Practices

### Naming Conventions

- Use descriptive names in kebab-case: `add-user-email-index` instead of `update-user`
- Include timestamp prefix for proper ordering
- File names use kebab-case, but class names use PascalCase

### Safe Migration Patterns

- Always implement both `up()` and `down()` methods
- Test migrations on sample data before production
- Make backward-compatible changes when possible
- Use transactions for multi-step operations

## Database Compatibility

OWOX Data Marts supports both MySQL and SQLite. When writing migrations:

### Supported Column Types

Use TypeORM's standard types that map correctly to both databases:

- `varchar`, `text` for strings
- `int`, `bigint` for integers
- `decimal` for precise numbers
- `datetime` for timestamps
- `boolean` for flags

### Cross-Database Guidelines

- Use TypeORM's declarative API instead of raw SQL when possible
- Test migrations on both MySQL and SQLite
- Avoid database-specific features in column types
- Use standard SQL for data migrations
- Avoid database-specific functions in DML queries
- Avoid specific index types or constraints
