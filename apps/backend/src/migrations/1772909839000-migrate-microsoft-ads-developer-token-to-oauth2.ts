import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateMicrosoftAdsDeveloperTokenToOauth21772909839000 implements MigrationInterface {
  public readonly name = 'MigrateMicrosoftAdsDeveloperTokenToOauth21772909839000';

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
        AND definition LIKE '%"DeveloperToken"%'
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configs = def?.connector?.source?.configuration;

      if (!Array.isArray(configs) || configs.length === 0) continue;

      let modified = false;

      for (const config of configs) {
        // Migrate top-level DeveloperToken into AuthType.oauth2
        if (
          config.DeveloperToken &&
          config.AuthType?.oauth2 &&
          !config.AuthType.oauth2.DeveloperToken
        ) {
          config.AuthType.oauth2.DeveloperToken = config.DeveloperToken;
          delete config.DeveloperToken;
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
        AND definition LIKE '%"DeveloperToken"%'
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configs = def?.connector?.source?.configuration;

      if (!Array.isArray(configs) || configs.length === 0) continue;

      let modified = false;

      for (const config of configs) {
        // Revert: move DeveloperToken back to top level
        if (config.AuthType?.oauth2?.DeveloperToken) {
          config.DeveloperToken = config.AuthType.oauth2.DeveloperToken;
          delete config.AuthType.oauth2.DeveloperToken;
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
