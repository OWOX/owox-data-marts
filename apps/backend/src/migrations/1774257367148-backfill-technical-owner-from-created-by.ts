import { MigrationInterface, QueryRunner } from 'typeorm';

export class BackfillTechnicalOwnerFromCreatedBy1774257367148 implements MigrationInterface {
  public readonly name = 'BackfillTechnicalOwnerFromCreatedBy1774257367148';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fetch all data marts that have a createdById but no technicalOwnerIds
    const rows: { id: string; createdById: string }[] = await queryRunner.query(`
      SELECT id, createdById FROM data_mart
      WHERE createdById IS NOT NULL
        AND createdById != ''
        AND technicalOwnerIds IS NULL
    `);

    // Update each row individually with the correct JSON value
    for (const row of rows) {
      const technicalOwnerIds = JSON.stringify([row.createdById]);
      await queryRunner.query(`UPDATE data_mart SET technicalOwnerIds = ? WHERE id = ?`, [
        technicalOwnerIds,
        row.id,
      ]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fetch data marts where technicalOwnerIds is a single-element array matching createdById
    const rows: { id: string; createdById: string; technicalOwnerIds: string }[] =
      await queryRunner.query(`
        SELECT id, createdById, technicalOwnerIds FROM data_mart
        WHERE technicalOwnerIds IS NOT NULL
          AND createdById IS NOT NULL
      `);

    for (const row of rows) {
      try {
        const ids =
          typeof row.technicalOwnerIds === 'string'
            ? JSON.parse(row.technicalOwnerIds)
            : row.technicalOwnerIds;
        if (Array.isArray(ids) && ids.length === 1 && ids[0] === row.createdById) {
          await queryRunner.query(`UPDATE data_mart SET technicalOwnerIds = NULL WHERE id = ?`, [
            row.id,
          ]);
        }
      } catch {
        // Skip rows with invalid JSON
      }
    }
  }
}
