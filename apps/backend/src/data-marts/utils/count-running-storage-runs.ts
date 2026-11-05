import { EntityManager } from 'typeorm';
import { ConcurrencyLimitExceededException } from '../../common/exceptions/concurrency-limit-exceeded.exception';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataStorage } from '../entities/data-storage.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';

/** A report or data quality run waits for a load on its DuckDB storage. */
export class DuckDbLoadHoldException extends ConcurrencyLimitExceededException {}

/** RUNNING runs of the given types on one storage, other than `runId`. */
export function countRunningStorageRuns(
  manager: EntityManager,
  storageId: string,
  types: DataMartRunType[],
  runId: string
): Promise<number> {
  return manager
    .createQueryBuilder(DataMartRun, 'run')
    .innerJoin(DataMart, 'dm', 'dm.id = run.dataMartId')
    .where('dm.storage = :storageId', { storageId })
    .andWhere('run.status = :status', { status: DataMartRunStatus.RUNNING })
    .andWhere('run.type IN (:...types)', { types })
    .andWhere('run.id != :runId', { runId })
    .getCount();
}

/**
 * Holds a report or data quality run on a DuckDB storage while a load runs there, and while
 * an older load still waits for it, so a stream of reads cannot keep a load waiting forever.
 */
export async function holdBehindDuckDbLoads(
  manager: EntityManager,
  storage: Pick<DataStorage, 'id' | 'projectId'>,
  run: Pick<DataMartRun, 'id' | 'createdAt'>,
  maxConnectorRunsPerProject: number
): Promise<void> {
  const storageId = storage.id;
  if (
    (await countRunningStorageRuns(manager, storageId, [DataMartRunType.CONNECTOR], run.id)) > 0
  ) {
    throw new DuckDbLoadHoldException(`DuckDB storage ${storageId} has a load in progress`);
  }
  const olderWaitingLoads = await manager
    .createQueryBuilder(DataMartRun, 'run')
    .innerJoin(DataMart, 'dm', 'dm.id = run.dataMartId')
    // A PENDING load without a live trigger never starts, so it must not hold anything.
    .innerJoin(
      ConnectorRunTrigger,
      'trigger',
      'trigger.dataMartRunId = run.id AND trigger.isActive = :isActive',
      { isActive: true }
    )
    .where('dm.storage = :storageId', { storageId })
    .andWhere('run.status = :status', { status: DataMartRunStatus.PENDING })
    .andWhere('run.type = :type', { type: DataMartRunType.CONNECTOR })
    .andWhere('run.createdAt < :createdAt', { createdAt: run.createdAt })
    .getCount();
  if (olderWaitingLoads === 0) {
    return;
  }
  // While the project has no free connector slot, the older load waits for the slot, not for
  // this storage, and cannot start anyway.
  const runningProjectLoads = await manager
    .createQueryBuilder(DataMartRun, 'run')
    .innerJoin(DataMart, 'dm', 'dm.id = run.dataMartId')
    .where('dm.projectId = :projectId', { projectId: storage.projectId })
    .andWhere('run.status = :status', { status: DataMartRunStatus.RUNNING })
    .andWhere('run.type = :type', { type: DataMartRunType.CONNECTOR })
    .getCount();
  if (runningProjectLoads < maxConnectorRunsPerProject) {
    throw new DuckDbLoadHoldException(`DuckDB storage ${storageId} has an older load waiting`);
  }
}
