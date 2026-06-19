import { FindOptionsWhere, In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { ConnectorRunTrigger } from '../entities/connector-run-trigger.entity';
import { ReportRunTrigger } from '../entities/report-run-trigger.entity';
import { TriggerStatus } from '../../common/scheduler/shared/entities/trigger-status';

type DataMartRunTrigger = ConnectorRunTrigger | ReportRunTrigger;

export async function stopRunTriggersForRun<T extends DataMartRunTrigger>(
  repository: Pick<Repository<T>, 'update'>,
  dataMartRunId: string
): Promise<void> {
  await repository.update(
    {
      dataMartRunId,
      status: In([TriggerStatus.IDLE, TriggerStatus.READY]),
    } as FindOptionsWhere<T>,
    {
      status: TriggerStatus.CANCELLED,
      isActive: false,
      version: () => 'version + 1',
    } as QueryDeepPartialEntity<T>
  );
  await repository.update(
    {
      dataMartRunId,
      status: TriggerStatus.PROCESSING,
    } as FindOptionsWhere<T>,
    {
      status: TriggerStatus.CANCELLING,
      isActive: false,
      version: () => 'version + 1',
    } as QueryDeepPartialEntity<T>
  );
}
