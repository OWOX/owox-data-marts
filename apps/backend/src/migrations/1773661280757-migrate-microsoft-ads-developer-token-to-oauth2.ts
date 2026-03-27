import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateMicrosoftAdsDeveloperTokenToOauth21773661280757 implements MigrationInterface {
  public readonly name = 'MigrateMicrosoftAdsDeveloperTokenToOauth21773661280757';

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
        const developerToken = config.DeveloperToken;
        if (!developerToken || !config.AuthType?.oauth2) continue;

        const credentialId = config.AuthType.oauth2._source_credential_id;

        if (credentialId) {
          const credRows = await queryRunner.query(
            `SELECT id, credentials FROM connector_source_credentials WHERE id = ?`,
            [credentialId]
          );

          if (credRows.length > 0) {
            const cred = credRows[0];
            const credentials =
              typeof cred.credentials === 'string'
                ? JSON.parse(cred.credentials)
                : cred.credentials;

            if (!credentials.developer_token) {
              credentials.developer_token = developerToken;
              await queryRunner.query(
                `UPDATE connector_source_credentials SET credentials = ? WHERE id = ?`,
                [JSON.stringify(credentials), cred.id]
              );
            }
          }
        } else {
          config.AuthType.oauth2.DeveloperToken = developerToken;
        }

        delete config.DeveloperToken;
        modified = true;
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
        `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const configs = def?.connector?.source?.configuration;

      if (!Array.isArray(configs) || configs.length === 0) continue;

      let modified = false;

      for (const config of configs) {
        if (!config.AuthType?.oauth2) continue;

        const credentialId = config.AuthType.oauth2._source_credential_id;

        if (credentialId) {
          const credRows = await queryRunner.query(
            `SELECT id, credentials FROM connector_source_credentials WHERE id = ?`,
            [credentialId]
          );

          if (credRows.length > 0) {
            const cred = credRows[0];
            const credentials =
              typeof cred.credentials === 'string'
                ? JSON.parse(cred.credentials)
                : cred.credentials;

            if (credentials.developer_token) {
              config.DeveloperToken = credentials.developer_token;
              delete credentials.developer_token;
              await queryRunner.query(
                `UPDATE connector_source_credentials SET credentials = ? WHERE id = ?`,
                [JSON.stringify(credentials), cred.id]
              );
              modified = true;
            }
          }
        } else if (config.AuthType.oauth2.DeveloperToken) {
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
