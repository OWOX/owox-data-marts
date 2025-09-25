import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameBingAdsConnectorToMicrosoftAdsForAllDb1758809780933
  implements MigrationInterface
{
  public readonly name = 'RenameBingAdsConnectorToMicrosoftAdsForAllDb1758809780933';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart 
        SET definition = REPLACE(
          REPLACE(definition, '"name":"BingAds"', '"name":"MicrosoftAds"'),
          '"name": "BingAds"', 
          '"name": "MicrosoftAds"'
          )
        WHERE definitionType='CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"BingAds"%' 
          OR definition LIKE '%"source":%"name": "BingAds"%'
          )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart 
        SET definition = REPLACE(
          REPLACE(definition, '"name":"MicrosoftAds"', '"name":"BingAds"'),
          '"name": "MicrosoftAds"', 
          '"name": "BingAds"'
          )
        WHERE definitionType='CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"MicrosoftAds"%' 
          OR definition LIKE '%"source":%"name": "MicrosoftAds"%'
          )
    `);
  }
}
