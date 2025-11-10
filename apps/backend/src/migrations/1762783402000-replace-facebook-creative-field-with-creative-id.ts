import { MigrationInterface, QueryRunner } from 'typeorm';
import { DataMart } from '../data-marts/entities/data-mart.entity';

export class ReplaceFacebookCreativeFieldWithCreativeId1762783402000 implements MigrationInterface {
  public readonly name = 'ReplaceFacebookCreativeFieldWithCreativeId1762783402000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.manager
      .getRepository(DataMart)
      .createQueryBuilder('dm')
      .select('dm.id', 'id')
      .addSelect('dm.definition', 'definition')
      .where('dm.definitionType = :type', { type: 'CONNECTOR' })
      .andWhere("JSON_EXTRACT(dm.definition, '$.connector.source.node') = :node", {
        node: 'ad-group',
      })
      .getRawMany<{ id: string; definition: unknown }>();

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const fields = def?.connector?.source?.fields;

      if (!Array.isArray(fields) || !fields.includes('creative')) continue;

      const newFields = fields.includes('creative_id')
        ? fields.filter((f: string) => f !== 'creative')
        : fields.map((f: string) => (f === 'creative' ? 'creative_id' : f));

      def.connector.source.fields = newFields;

      await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
        JSON.stringify(def),
        row.id,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.manager
      .getRepository(DataMart)
      .createQueryBuilder('dm')
      .select('dm.id', 'id')
      .addSelect('dm.definition', 'definition')
      .where('dm.definitionType = :type', { type: 'CONNECTOR' })
      .andWhere("JSON_EXTRACT(dm.definition, '$.connector.source.node') = :node", {
        node: 'ad-group',
      })
      .getRawMany<{ id: string; definition: unknown }>();

    for (const row of rows) {
      const def = typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition;
      const fields = def?.connector?.source?.fields;

      if (!Array.isArray(fields) || !fields.includes('creative_id') || fields.includes('creative'))
        continue;

      def.connector.source.fields = fields.map((f: string) =>
        f === 'creative_id' ? 'creative' : f
      );

      await queryRunner.query(`UPDATE data_mart SET definition = ? WHERE id = ?`, [
        JSON.stringify(def),
        row.id,
      ]);
    }
  }
}
