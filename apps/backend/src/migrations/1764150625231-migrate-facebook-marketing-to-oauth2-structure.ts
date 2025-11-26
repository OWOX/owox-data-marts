import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateFacebookMarketingToOauth2Structure1764150625231 implements MigrationInterface {
  public readonly name = 'MigrateFacebookMarketingToOauth2Structure1764150625231';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"FacebookMarketing"%'
          OR definition LIKE '%"source":%"name": "FacebookMarketing"%'
        )
        AND deletedAt IS NULL
        AND (
          definition LIKE '%"AccessToken"%'
        )
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configs = def?.connector?.source?.configuration;

      if (!Array.isArray(configs) || configs.length === 0) continue;

      let modified = false;

      for (const config of configs) {
        if (config.AccessToken && !config.AuthType) {
          config.AuthType = {
            oauth2: {
              AccessToken: config.AccessToken,
            },
          };

          modified = true;
        }
      }

      if (modified) {
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
        AND deletedAt IS NULL
        AND definition LIKE '%"AuthType"%'
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configs = def?.connector?.source?.configuration;

      if (!Array.isArray(configs) || configs.length === 0) continue;

      let modified = false;

      for (const config of configs) {
        if (config.AuthType?.oauth2?.AccessToken) {
          config.AccessToken = config.AuthType.oauth2.AccessToken;
          delete config.AuthType;
          modified = true;
        }
      }

      if (modified) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(def),
          row.id,
        ]);
      }
    }
  }
}
