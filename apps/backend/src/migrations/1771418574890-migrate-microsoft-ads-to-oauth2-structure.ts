import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateMicrosoftAdsToOauth2Structure1771418574890 implements MigrationInterface {
  public readonly name = 'MigrateMicrosoftAdsToOauth2Structure1771418574890';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"MicrosoftAds"%'
          OR definition LIKE '%"source":%"name": "MicrosoftAds"%'
        )
        AND deletedAt IS NULL
        AND (
          definition LIKE '%"RefreshToken"%'
        )
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configs = def?.connector?.source?.configuration;

      if (!Array.isArray(configs) || configs.length === 0) continue;

      let modified = false;

      for (const config of configs) {
        if (config.RefreshToken && !config.AuthType) {
          config.AuthType = {
            oauth2: {
              RefreshToken: config.RefreshToken,
              ClientId: config.ClientID,
              ClientSecret: config.ClientSecret,
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
          definition LIKE '%"source":%"name":"MicrosoftAds"%'
          OR definition LIKE '%"source":%"name": "MicrosoftAds"%'
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
        if (config.AuthType?.oauth2?.RefreshToken) {
          config.RefreshToken = config.AuthType.oauth2.RefreshToken;
          if (config.AuthType.oauth2.ClientId) {
            config.ClientID = config.AuthType.oauth2.ClientId;
          }
          if (config.AuthType.oauth2.ClientSecret) {
            config.ClientSecret = config.AuthType.oauth2.ClientSecret;
          }
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
