import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

export class CreateMutationReceipts1792401000000 implements MigrationInterface {
  name = 'CreateMutationReceipts1792401000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mutation_receipt',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'identityHash', type: 'varchar', length: '64' },
          { name: 'intentHash', type: 'varchar', length: '64' },
          { name: 'status', type: 'varchar', length: '16' },
          { name: 'result', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_mutation_receipt_identity',
            columnNames: ['identityHash'],
            isUnique: true,
          }),
        ],
      })
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'mutation_receipt');
  }
}
