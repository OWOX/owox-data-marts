import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMicrosoftAdsAccountIdToAccountIds1767093646000 implements MigrationInterface {
  public readonly name = 'RenameMicrosoftAdsAccountIdToAccountIds1767093646000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
            SELECT id, definition
            FROM data_mart
            WHERE definitionType = 'CONNECTOR'
            AND (
                definition LIKE '%"source":%"name":"MicrosoftAds"%'
                OR definition LIKE '%"source":%"name": "MicrosoftAds"%'
            )
            AND (
                definition LIKE '%"AccountID"%'
            )
        `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configuration = def?.connector?.source?.configuration;

      if (!Array.isArray(configuration)) continue;

      let hasChanges = false;
      for (const configItem of configuration) {
        if (configItem && typeof configItem === 'object' && 'AccountID' in configItem) {
          configItem.AccountIDs = configItem.AccountID;
          delete configItem.AccountID;
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
                definition LIKE '%"source":%"name":"MicrosoftAds"%'
                OR definition LIKE '%"source":%"name": "MicrosoftAds"%'
            )
        `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configuration = def?.connector?.source?.configuration;

      if (!Array.isArray(configuration)) continue;

      let hasChanges = false;
      for (const configItem of configuration) {
        if (configItem && typeof configItem === 'object' && 'AccountIDs' in configItem) {
          configItem.AccountID = configItem.AccountIDs;
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
