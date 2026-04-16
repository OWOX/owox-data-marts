import { MigrationInterface, QueryRunner } from 'typeorm';

type ConnectorConfig = Record<string, unknown> & {
  _secrets_id?: string;
  AuthType?: Record<string, Record<string, unknown>>;
};

type ConnectorDefinition = {
  connector?: {
    source?: {
      name?: string;
      configuration?: ConnectorConfig[];
    };
  };
};

const LINKEDIN_CONNECTORS = ['LinkedInAds', 'LinkedInPages'] as const;
const SECRET_FIELD_MAPPING: Record<string, string> = {
  RefreshToken: 'RefreshToken',
  ClientSecret: 'ClientSecret',
  AccessToken: 'AccessToken',
};

export class MigrateLinkedInConnectorsToOauth2Structure1774900000000 implements MigrationInterface {
  public readonly name = 'MigrateLinkedInConnectorsToOauth2Structure1774900000000';

  private parseJson(value: unknown): Record<string, unknown> {
    return typeof value === 'string' ? JSON.parse(value) : (value as Record<string, unknown>);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND deletedAt IS NULL
        AND (
          definition LIKE '%"source":%"name":"LinkedInAds"%'
          OR definition LIKE '%"source":%"name": "LinkedInAds"%'
          OR definition LIKE '%"source":%"name":"LinkedInPages"%'
          OR definition LIKE '%"source":%"name": "LinkedInPages"%'
        )
    `);

    for (const row of rows) {
      const definition = this.parseJson(row.definition) as ConnectorDefinition;
      const connectorName = definition?.connector?.source?.name as string | undefined;
      const configs = definition?.connector?.source?.configuration as ConnectorConfig[] | undefined;

      if (
        !connectorName ||
        !LINKEDIN_CONNECTORS.includes(connectorName as (typeof LINKEDIN_CONNECTORS)[number])
      ) {
        continue;
      }

      if (!Array.isArray(configs) || configs.length === 0) {
        continue;
      }

      let modifiedDefinition = false;

      for (const config of configs) {
        const authType = (config.AuthType || {}) as Record<string, Record<string, unknown>>;
        const oauthConfig = (authType.oauth2 || {}) as Record<string, unknown>;
        const nextOauthConfig = { ...oauthConfig };
        let modifiedConfig = false;

        const clientId = config.ClientID;
        if (clientId !== undefined && clientId !== null && nextOauthConfig.ClientId === undefined) {
          nextOauthConfig.ClientId = clientId;
          modifiedConfig = true;
        }

        for (const [legacyField, oauthField] of Object.entries(SECRET_FIELD_MAPPING)) {
          const legacyValue = config[legacyField];
          if (
            legacyValue !== undefined &&
            legacyValue !== null &&
            nextOauthConfig[oauthField] === undefined
          ) {
            nextOauthConfig[oauthField] = legacyValue;
            modifiedConfig = true;
          }
        }

        if (Object.keys(nextOauthConfig).length > 0 || authType.oauth2) {
          config.AuthType = {
            ...authType,
            oauth2: nextOauthConfig,
          };
          modifiedConfig = true;
        }

        if (config._secrets_id) {
          await queryRunner.query(
            `
              UPDATE connector_source_credentials
              SET credentials = JSON_REMOVE(
                JSON_SET(
                  credentials,
                  '$."AuthType.oauth2.RefreshToken"',
                  credentials->>'$.RefreshToken'
                ),
                '$.RefreshToken'
              )
              WHERE id = ?
                AND credentials->>'$.RefreshToken' IS NOT NULL
                AND credentials->>'$."AuthType.oauth2.RefreshToken"' IS NULL
            `,
            [config._secrets_id]
          );

          await queryRunner.query(
            `
              UPDATE connector_source_credentials
              SET credentials = JSON_REMOVE(
                JSON_SET(
                  credentials,
                  '$."AuthType.oauth2.ClientSecret"',
                  credentials->>'$.ClientSecret'
                ),
                '$.ClientSecret'
              )
              WHERE id = ?
                AND credentials->>'$.ClientSecret' IS NOT NULL
                AND credentials->>'$."AuthType.oauth2.ClientSecret"' IS NULL
            `,
            [config._secrets_id]
          );

          await queryRunner.query(
            `
              UPDATE connector_source_credentials
              SET credentials = JSON_REMOVE(
                JSON_SET(
                  credentials,
                  '$."AuthType.oauth2.AccessToken"',
                  credentials->>'$.AccessToken'
                ),
                '$.AccessToken'
              )
              WHERE id = ?
                AND credentials->>'$.AccessToken' IS NOT NULL
                AND credentials->>'$."AuthType.oauth2.AccessToken"' IS NULL
            `,
            [config._secrets_id]
          );
        }

        if (modifiedConfig) {
          modifiedDefinition = true;
        }
      }

      if (modifiedDefinition) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(definition),
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
        AND deletedAt IS NULL
        AND (
          definition LIKE '%"source":%"name":"LinkedInAds"%'
          OR definition LIKE '%"source":%"name": "LinkedInAds"%'
          OR definition LIKE '%"source":%"name":"LinkedInPages"%'
          OR definition LIKE '%"source":%"name": "LinkedInPages"%'
        )
    `);

    for (const row of rows) {
      const definition = this.parseJson(row.definition) as ConnectorDefinition;
      const connectorName = definition?.connector?.source?.name as string | undefined;
      const configs = definition?.connector?.source?.configuration as ConnectorConfig[] | undefined;

      if (
        !connectorName ||
        !LINKEDIN_CONNECTORS.includes(connectorName as (typeof LINKEDIN_CONNECTORS)[number])
      ) {
        continue;
      }

      if (!Array.isArray(configs) || configs.length === 0) {
        continue;
      }

      let modifiedDefinition = false;

      for (const config of configs) {
        const oauthConfig = config.AuthType?.oauth2 as Record<string, unknown> | undefined;
        let modifiedConfig = false;

        if (oauthConfig) {
          if (
            oauthConfig.ClientId !== undefined &&
            oauthConfig.ClientId !== null &&
            !config.ClientID
          ) {
            config.ClientID = oauthConfig.ClientId;
            modifiedConfig = true;
          }

          for (const [legacyField, oauthField] of Object.entries(SECRET_FIELD_MAPPING)) {
            if (
              oauthConfig[oauthField] !== undefined &&
              oauthConfig[oauthField] !== null &&
              config[legacyField] === undefined
            ) {
              config[legacyField] = oauthConfig[oauthField];
              modifiedConfig = true;
            }
          }

          delete config.AuthType;
          modifiedConfig = true;
        }

        if (config._secrets_id) {
          await queryRunner.query(
            `
              UPDATE connector_source_credentials
              SET credentials = JSON_REMOVE(
                JSON_SET(
                  credentials,
                  '$.RefreshToken',
                  credentials->>'$."AuthType.oauth2.RefreshToken"'
                ),
                '$."AuthType.oauth2.RefreshToken"'
              )
              WHERE id = ?
                AND credentials->>'$."AuthType.oauth2.RefreshToken"' IS NOT NULL
                AND credentials->>'$.RefreshToken' IS NULL
            `,
            [config._secrets_id]
          );

          await queryRunner.query(
            `
              UPDATE connector_source_credentials
              SET credentials = JSON_REMOVE(
                JSON_SET(
                  credentials,
                  '$.ClientSecret',
                  credentials->>'$."AuthType.oauth2.ClientSecret"'
                ),
                '$."AuthType.oauth2.ClientSecret"'
              )
              WHERE id = ?
                AND credentials->>'$."AuthType.oauth2.ClientSecret"' IS NOT NULL
                AND credentials->>'$.ClientSecret' IS NULL
            `,
            [config._secrets_id]
          );

          await queryRunner.query(
            `
              UPDATE connector_source_credentials
              SET credentials = JSON_REMOVE(
                JSON_SET(
                  credentials,
                  '$.AccessToken',
                  credentials->>'$."AuthType.oauth2.AccessToken"'
                ),
                '$."AuthType.oauth2.AccessToken"'
              )
              WHERE id = ?
                AND credentials->>'$."AuthType.oauth2.AccessToken"' IS NOT NULL
                AND credentials->>'$.AccessToken' IS NULL
            `,
            [config._secrets_id]
          );
        }

        if (modifiedConfig) {
          modifiedDefinition = true;
        }
      }

      if (modifiedDefinition) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(definition),
          row.id,
        ]);
      }
    }
  }
}
