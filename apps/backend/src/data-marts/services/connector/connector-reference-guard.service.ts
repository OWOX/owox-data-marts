import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ConnectorReferenceGuard } from '../../entities/connector-reference-guard.entity';

/** All connector consumers take this lock before changing source/version references. */
@Injectable()
export class ConnectorReferenceGuardService {
  async acquire(manager: EntityManager, projectId: string): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Connector guard requires a transaction');
    await manager
      .getRepository(ConnectorReferenceGuard)
      .createQueryBuilder()
      .insert()
      .values({ projectId, generation: 0 })
      .orUpdate(['projectId'], ['projectId'])
      .execute();
    await manager.getRepository(ConnectorReferenceGuard).increment({ projectId }, 'generation', 1);
  }
}
