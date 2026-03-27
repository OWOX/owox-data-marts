import { MigrationInterface, QueryRunner } from 'typeorm';

export class CopyDeveloperTokenToOauth2Credentials1774619679000 implements MigrationInterface {
  public readonly name = 'CopyDeveloperTokenToOauth2Credentials1774619679000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE connector_source_credentials
      SET credentials = JSON_SET(
        credentials,
        '$."AuthType.oauth2.DeveloperToken"',
        credentials->>'$.DeveloperToken'
      )
      WHERE connectorName = 'MicrosoftAds'
        AND credentials->>'$.DeveloperToken' IS NOT NULL
        AND credentials->>'$."AuthType.oauth2.DeveloperToken"' IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE connector_source_credentials
      SET credentials = JSON_REMOVE(
        credentials,
        '$."AuthType.oauth2.DeveloperToken"'
      )
      WHERE connectorName = 'MicrosoftAds'
        AND credentials->>'$."AuthType.oauth2.DeveloperToken"' IS NOT NULL
        AND credentials->>'$.DeveloperToken' IS NOT NULL
    `);
  }
}
