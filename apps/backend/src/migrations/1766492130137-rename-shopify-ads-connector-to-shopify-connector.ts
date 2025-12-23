import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameShopifyAdsConnectorToShopifyConnector1766492130137 implements MigrationInterface {
  public readonly name = 'RenameShopifyAdsConnectorToShopifyConnector1766492130137';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart 
        SET definition = REPLACE(
          REPLACE(definition, '"name":"ShopifyAds"', '"name":"Shopify"'),
          '"name": "ShopifyAds"', 
          '"name": "Shopify"'
          )
        WHERE definitionType='CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"ShopifyAds"%' 
          OR definition LIKE '%"source":%"name": "ShopifyAds"%'
          )
    `);
    await queryRunner.query(`
        UPDATE data_mart_run 
        SET definitionRun = REPLACE(
          REPLACE(definitionRun, '"name":"ShopifyAds"', '"name":"Shopify"'),
          '"name": "ShopifyAds"', 
          '"name": "Shopify"'
          )
        WHERE
          definitionRun LIKE '%"source":%"name":"ShopifyAds"%' 
          OR definitionRun LIKE '%"source":%"name": "ShopifyAds"%'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
        UPDATE data_mart
        SET definition = REPLACE(
          REPLACE(definition, '"name":"Shopify"', '"name":"ShopifyAds"'),
          '"name": "Shopify"', 
          '"name": "ShopifyAds"'
          )
        WHERE definitionType='CONNECTOR'
        AND (
          definition LIKE '%"source":%"name":"Shopify"%' 
          OR definition LIKE '%"source":%"name": "Shopify"%'
          )
    `);
    await queryRunner.query(`
        UPDATE data_mart_run
        SET definitionRun = REPLACE(
          REPLACE(definitionRun, '"name":"Shopify"', '"name":"ShopifyAds"'),
          '"name": "Shopify"', 
          '"name": "ShopifyAds"'
          )
        WHERE 
          definitionRun LIKE '%"source":%"name":"Shopify"%' 
          OR definitionRun LIKE '%"source":%"name": "Shopify"%'
    `);
  }
}
