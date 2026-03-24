import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Migration to extract inline secrets from DataMart definitions
 * and store them in connector_source_credentials table.
 *
 * This migration:
 * 1. Finds all DataMarts with CONNECTOR definition type
 * 2. For each configuration item, extracts known secret fields
 * 3. Creates a record in connector_source_credentials
 * 4. Updates the definition with _secrets_id reference
 * 5. Removes inline secret values from definition
 *
 * Note: OAuth-based configurations (with _source_credential_id) are skipped
 * as their secrets are already externalized.
 */
export class MigrateInlineSecretsToCredentialsTable1774500000001 implements MigrationInterface {
  public readonly name = 'MigrateInlineSecretsToCredentialsTable1774500000001';

  /**
   * Known secret field NAMES per connector type (without paths).
   * These are fields marked as SECRET in connector specifications.
   * The migration will recursively search for these field names in the configuration.
   */
  private readonly SECRET_FIELD_NAMES_BY_CONNECTOR: Record<string, string[]> = {
    // XAds uses OAuth 1.0a style credentials (all are secrets)
    XAds: ['ConsumerKey', 'ConsumerSecret', 'AccessToken', 'AccessTokenSecret'],

    // RedditAds uses client credentials with refresh token
    RedditAds: ['ClientSecret', 'RefreshToken', 'AccessToken'],

    // LinkedIn connectors use OAuth-style credentials
    LinkedInPages: ['ClientSecret', 'RefreshToken', 'AccessToken'],
    LinkedInAds: ['ClientSecret', 'RefreshToken', 'AccessToken'],

    // CriteoAds uses API key style credentials
    CriteoAds: ['AccessToken', 'ClientSecret'],

    // GitHub uses personal access token
    GitHub: ['AccessToken'],

    // Shopify uses admin API token
    Shopify: ['AccessToken'],

    // OpenExchangeRates uses API key
    OpenExchangeRates: ['AppId'],

    // GoogleAds - secrets may be nested in AuthType.oauth2.{...} or AuthType.service_account.{...}
    // ServiceAccountKey at top level or inside AuthType, DeveloperToken at top level
    // RefreshToken, ClientSecret, ClientId may be inside AuthType.oauth2
    GoogleAds: ['ServiceAccountKey', 'DeveloperToken', 'RefreshToken', 'ClientSecret', 'ClientId'],

    // Deprecated/legacy fields that might exist in old configurations
    // These are for backwards compatibility with pre-OAuth migrations
    TikTokAds: ['AccessToken', 'AppSecret'],
    MicrosoftAds: ['ClientSecret', 'RefreshToken', 'DeveloperToken'],
    // Note: FacebookMarketing may have 'accessToken' (lowercase) in old configs
    FacebookMarketing: ['AccessToken', 'accessToken', 'AppSecret'],
  };

  /**
   * Recursively extracts secrets from an object.
   * Returns secrets with their full path (e.g., "AuthType.oauth2.RefreshToken")
   */
  private extractSecretsRecursively(
    obj: Record<string, unknown>,
    secretFieldNames: Set<string>,
    path: string = ''
  ): Record<string, unknown> {
    const secrets: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip internal fields
      if (key.startsWith('_')) {
        continue;
      }

      const currentPath = path ? `${path}.${key}` : key;

      if (secretFieldNames.has(key)) {
        // Found a secret field
        if (value !== undefined && value !== null && value !== '**********') {
          secrets[currentPath] = value;
        }
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects
        const nestedSecrets = this.extractSecretsRecursively(
          value as Record<string, unknown>,
          secretFieldNames,
          currentPath
        );
        Object.assign(secrets, nestedSecrets);
      }
    }

    return secrets;
  }

  /**
   * Removes secrets from an object (recursively).
   */
  private removeSecretsRecursively(
    obj: Record<string, unknown>,
    secretFieldNames: Set<string>
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('_')) {
        continue;
      }

      if (secretFieldNames.has(key)) {
        delete obj[key];
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        this.removeSecretsRecursively(value as Record<string, unknown>, secretFieldNames);
      }
    }
  }

  /**
   * Checks if object has _source_credential_id anywhere (recursively).
   * This indicates OAuth flow is used and secrets are already externalized.
   */
  private hasSourceCredentialIdRecursively(obj: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '_source_credential_id') {
        return true;
      }
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if (this.hasSourceCredentialIdRecursively(value as Record<string, unknown>)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Injects secrets back into an object at their original paths.
   */
  private injectSecretsAtPaths(
    obj: Record<string, unknown>,
    secrets: Record<string, unknown>
  ): void {
    for (const [path, value] of Object.entries(secrets)) {
      const parts = path.split('.');
      let current = obj;

      // Navigate to the parent object, creating intermediate objects if needed
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }

      // Set the value at the final key
      const lastPart = parts[parts.length - 1];
      current[lastPart] = value;
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Get all connector DataMarts (including deleted ones to clean up secrets)
    const rows = await queryRunner.query(`
      SELECT id, projectId, definition, deletedAt
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND definition IS NOT NULL
    `);

    let migratedCount = 0;
    let skippedCount = 0;
    let cleanedDeletedCount = 0;

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const connectorName = def?.connector?.source?.name;
      const configs = def?.connector?.source?.configuration;

      if (!connectorName || !Array.isArray(configs) || configs.length === 0) {
        continue;
      }

      const secretFieldNames = this.SECRET_FIELD_NAMES_BY_CONNECTOR[connectorName];
      if (!secretFieldNames || secretFieldNames.length === 0) {
        continue;
      }

      const secretFieldNamesSet = new Set(secretFieldNames);
      let modified = false;
      const isDeleted = row.deletedAt !== null;

      for (const config of configs) {
        // Generate _id if missing (for old configs without it)
        let configId = config._id;
        if (!configId) {
          configId = randomUUID();
          config._id = configId;
          modified = true; // Need to save the generated _id
        }

        // Skip if already has _secrets_id (already migrated)
        if (config._secrets_id) {
          skippedCount++;
          continue;
        }

        // Skip if uses OAuth (has _source_credential_id anywhere in the config)
        // These configurations already have externalized secrets via OAuth flow
        if (this.hasSourceCredentialIdRecursively(config)) {
          skippedCount++;
          continue;
        }

        // Recursively extract secret values with their paths
        const secrets = this.extractSecretsRecursively(config, secretFieldNamesSet);

        // Skip if no secrets found
        if (Object.keys(secrets).length === 0) {
          continue;
        }

        // Create credentials record (with deletedAt for deleted DataMarts)
        const secretsId = randomUUID();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

        await queryRunner.query(
          `
          INSERT INTO connector_source_credentials
          (id, projectId, connectorName, dataMartId, configId, credentials, createdAt, modifiedAt, deletedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            secretsId,
            row.projectId,
            connectorName,
            row.id,
            configId,
            JSON.stringify(secrets),
            now,
            now,
            isDeleted ? row.deletedAt : null,
          ]
        );

        // Update config with _secrets_id and remove inline secrets (recursively)
        config._secrets_id = secretsId;
        this.removeSecretsRecursively(config, secretFieldNamesSet);

        modified = true;
        if (isDeleted) {
          cleanedDeletedCount++;
        } else {
          migratedCount++;
        }
      }

      if (modified) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(def),
          row.id,
        ]);
      }
    }

    // Migration complete: migratedCount=${migratedCount}, cleanedDeletedCount=${cleanedDeletedCount}, skippedCount=${skippedCount}
    void migratedCount;
    void cleanedDeletedCount;
    void skippedCount;
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Get all secrets records created by this migration
    const secretsRows = await queryRunner.query(`
      SELECT id, dataMartId, configId, credentials
      FROM connector_source_credentials
      WHERE dataMartId IS NOT NULL
        AND configId IS NOT NULL
        AND deletedAt IS NULL
    `);

    // Group by dataMartId for efficiency
    const secretsByDataMart = new Map<
      string,
      Array<{ configId: string; credentials: Record<string, unknown> }>
    >();
    for (const row of secretsRows) {
      const dataMartId = row.dataMartId;
      if (!secretsByDataMart.has(dataMartId)) {
        secretsByDataMart.set(dataMartId, []);
      }
      secretsByDataMart.get(dataMartId)!.push({
        configId: row.configId,
        credentials:
          typeof row.credentials === 'string' ? JSON.parse(row.credentials) : row.credentials,
      });
    }

    // Restore secrets to definitions
    for (const [dataMartId, secretsList] of secretsByDataMart) {
      const [dataMartRow] = await queryRunner.query(
        `SELECT definition FROM data_mart WHERE id = ?`,
        [dataMartId]
      );

      if (!dataMartRow) continue;

      const def =
        typeof dataMartRow.definition === 'string'
          ? JSON.parse(dataMartRow.definition)
          : dataMartRow.definition;

      const configs = def?.connector?.source?.configuration;
      if (!Array.isArray(configs)) continue;

      let modified = false;

      for (const secretsEntry of secretsList) {
        const config = configs.find(
          (c: Record<string, unknown>) => c._id === secretsEntry.configId
        );
        if (!config) continue;

        // Restore secrets at their original paths and remove _secrets_id
        this.injectSecretsAtPaths(config, secretsEntry.credentials);
        delete config._secrets_id;
        modified = true;
      }

      if (modified) {
        await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
          JSON.stringify(def),
          dataMartId,
        ]);
      }
    }

    // Delete all secrets records that have dataMartId (created by this migration)
    await queryRunner.query(`
      DELETE FROM connector_source_credentials
      WHERE dataMartId IS NOT NULL
        AND configId IS NOT NULL
    `);
  }
}
