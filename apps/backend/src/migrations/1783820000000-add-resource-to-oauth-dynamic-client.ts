import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { getTable } from './migration-utils';

const TABLE_NAME = 'oauth_dynamic_client';
const COLUMN_NAME = 'resource';

export class AddResourceToOAuthDynamicClient1783820000000 implements MigrationInterface {
  public readonly name = 'AddResourceToOAuthDynamicClient1783820000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, TABLE_NAME);
    if (!table.columns.some(column => column.name === COLUMN_NAME)) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: COLUMN_NAME,
          type: 'varchar',
          length: '2048',
          isNullable: true,
        })
      );

      const sharedResource = this.sharedResource;
      if (sharedResource) {
        await queryRunner.manager
          .createQueryBuilder()
          .update(TABLE_NAME)
          .set({ resource: sharedResource })
          .execute();
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, TABLE_NAME);
    if (table.columns.some(column => column.name === COLUMN_NAME)) {
      await queryRunner.dropColumn(table, COLUMN_NAME);
    }
  }

  private get sharedResource(): string | null {
    const configuredResource = process.env.MCP_OAUTH_RESOURCE?.trim().replace(/\/$/, '');
    if (configuredResource) {
      return configuredResource;
    }

    const publicBaseUrl = process.env.MCP_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');
    return publicBaseUrl ? `${publicBaseUrl}/mcp` : null;
  }
}
