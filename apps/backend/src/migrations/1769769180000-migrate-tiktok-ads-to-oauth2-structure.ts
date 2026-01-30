import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateTikTokAdsToOauth2Structure1769769180000 implements MigrationInterface {
  public readonly name = 'MigrateTikTokAdsToOauth2Structure1769769180000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"TikTokAds"%'
          OR definition LIKE '%"source":%"name": "TikTokAds"%'
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
            value: 'oauth2',
            items: {
              AccessToken: { value: config.AccessToken },
              AppId: { value: config.AppId },
              AppSecret: { value: config.AppSecret },
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
          definition LIKE '%"source":%"name":"TikTokAds"%'
          OR definition LIKE '%"source":%"name": "TikTokAds"%'
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
        if (config.AuthType?.items?.AccessToken?.value) {
          config.AccessToken = config.AuthType.items.AccessToken.value;
          if (config.AuthType.items.AppId?.value) {
            config.AppId = config.AuthType.items.AppId.value;
          }
          if (config.AuthType.items.AppSecret?.value) {
            config.AppSecret = config.AuthType.items.AppSecret.value;
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
