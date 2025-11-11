import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveFacebookCreativeField1762783402000 implements MigrationInterface {
  public readonly name = 'RemoveFacebookCreativeField1762783402000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT id, definition
      FROM data_mart
      WHERE definitionType = 'CONNECTOR'
        AND (
          definition LIKE '%"source":%"node":"ad-group"%'
          OR definition LIKE '%"source":%"node": "ad-group"%'
        )
        AND (
          definition LIKE '%"source":%"name":"FacebookMarketing"%'
          OR definition LIKE '%"source":%"name": "FacebookMarketing"%'
        )
    `);

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const fields = def?.connector?.source?.fields;

      if (!Array.isArray(fields) || !fields.includes('creative')) continue;

      // Remove the 'creative' field from the selection if present
      def.connector.source.fields = fields.filter((f: string) => f !== 'creative');

      await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
        JSON.stringify(def),
        row.id,
      ]);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op because we cannot determine which clients previously selected the 'creative' field
  }
}
