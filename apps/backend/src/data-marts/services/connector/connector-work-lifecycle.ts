import { NotFoundException } from '@nestjs/common';
import { EntityManager, In, IsNull } from 'typeorm';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { ConnectorRunTrigger } from '../../entities/connector-run-trigger.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';

/** Serialize enqueue/handover with deletion without advancing the configuration revision. */
export async function lockDataMartConnectorWork(
  manager: EntityManager,
  dataMartId: string,
  projectId: string
): Promise<void> {
  const result = await manager.update(
    DataMart,
    { id: dataMartId, projectId, deletedAt: IsNull() },
    { revision: () => 'revision' }
  );
  if (result.affected !== 1) throw new NotFoundException('Data Mart not found');
}

/** Call inside the deletion transaction; cancelled runs cannot finish or queue a successor. */
export async function cancelDataMartConnectorWork(
  manager: EntityManager,
  dataMartId: string,
  projectId: string
): Promise<void> {
  await lockDataMartConnectorWork(manager, dataMartId, projectId);
  await manager.update(
    DataMartRun,
    {
      dataMartId,
      type: DataMartRunType.CONNECTOR,
      status: In([
        DataMartRunStatus.PENDING,
        DataMartRunStatus.RUNNING,
        DataMartRunStatus.INTERRUPTED,
      ]),
    },
    { status: DataMartRunStatus.CANCELLED, finishedAt: new Date() }
  );
  await manager.update(
    ConnectorRunTrigger,
    { dataMartId, projectId },
    { isActive: false, status: TriggerStatus.CANCELLED }
  );
}
