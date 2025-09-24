import { MigrationInterface, QueryRunner } from 'typeorm';

export class NewMigration1758720208111 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart 
        SET definition = REPLACE(definition, '"name":"BingAds"', '"name":"MicrosoftAds"')
        WHERE definitionType='CONNECTOR'
        AND definition LIKE '%"source":%"name":"BingAds"%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart 
        SET definition = REPLACE(definition, '"name":"MicrosoftAds"', '"name":"BingAds"')
        WHERE definitionType='CONNECTOR'
        AND definition LIKE '%"source":%"name":"MicrosoftAds"%'
    `);
  }
}
