import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameBingAdsToMicrosoftAdsInDataMartRun1760960349899 implements MigrationInterface {
  public readonly name = 'RenameBingAdsToMicrosoftAdsInDataMartRun1760960349899';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart_run 
        SET definitionRun = REPLACE(
          REPLACE(definitionRun, '"name":"BingAds"', '"name":"MicrosoftAds"'),
          '"name": "BingAds"', 
          '"name": "MicrosoftAds"'
          )
        WHERE
          definitionRun LIKE '%"source":%"name":"BingAds"%' 
          OR definitionRun LIKE '%"source":%"name": "BingAds"%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart_run
        SET definitionRun = REPLACE(
          REPLACE(definitionRun, '"name":"MicrosoftAds"', '"name":"BingAds"'),
          '"name": "MicrosoftAds"', 
          '"name": "BingAds"'
          )
        WHERE 
          definitionRun LIKE '%"source":%"name":"MicrosoftAds"%' 
          OR definitionRun LIKE '%"source":%"name": "MicrosoftAds"%'
    `);
  }
}
