import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixFacebookMarketingAccountIdsFieldName1764768652000 implements MigrationInterface {
  public readonly name = 'FixFacebookMarketingAccountIdsFieldName1764768652000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"FacebookMarketing"%'
          OR definition LIKE '%"source":%"name": "FacebookMarketing"%'
        )
        AND (
          definition LIKE '%"AccoundIDs"%'
        )
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configuration = def?.connector?.source?.configuration;

      if (!Array.isArray(configuration)) continue;

      let hasChanges = false;
      for (const configItem of configuration) {
        if (configItem && typeof configItem === 'object' && 'AccoundIDs' in configItem) {
          configItem.AccountIDs = configItem.AccoundIDs;
          delete configItem.AccoundIDs;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(def),
          row.id,
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"FacebookMarketing"%'
          OR definition LIKE '%"source":%"name": "FacebookMarketing"%'
        )
        AND (
          definition LIKE '%"AccountIDs"%'
        )
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configuration = def?.connector?.source?.configuration;

      if (!Array.isArray(configuration)) continue;

      let hasChanges = false;
      for (const configItem of configuration) {
        if (configItem && typeof configItem === 'object' && 'AccountIDs' in configItem) {
          configItem.AccoundIDs = configItem.AccountIDs;
          delete configItem.AccountIDs;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(def),
          row.id,
        ]);
      }
    }
  }
}
