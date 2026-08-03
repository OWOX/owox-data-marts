import { ConflictException } from '@nestjs/common';
import { RunType } from '../../../../common/scheduler/shared/types';
import { IdpProjectionsFacade } from '../../../../idp/facades/idp-projections.facade';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { DataQualityRunRequestService } from '../../../services/data-quality-run-request.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import { ScheduledDataQualityRunProcessor } from './scheduled-data-quality-run-processor';

describe('ScheduledDataQualityRunProcessor', () => {
  const createTrigger = (
    overrides: Partial<DataMartScheduledTrigger> = {}
  ): DataMartScheduledTrigger =>
    ({
      id: 'schedule-1',
      type: ScheduledTriggerType.DATA_QUALITY_RUN,
      createdById: 'user-1',
      dataMart: {
        id: 'data-mart-1',
        projectId: 'project-1',
      },
      ...overrides,
    }) as DataMartScheduledTrigger;

  const createProcessor = () => {
    const idpProjectionsFacade = {
      getProjectMemberOrThrow: jest.fn().mockResolvedValue({
        userId: 'user-1',
        role: 'editor',
      }),
    };
    const runRequestService = {
      enqueue: jest.fn().mockResolvedValue({ dataMartRunId: 'run-1' }),
    };
    const processor = new ScheduledDataQualityRunProcessor(
      idpProjectionsFacade as unknown as IdpProjectionsFacade,
      runRequestService as unknown as DataQualityRunRequestService
    );

    return { processor, idpProjectionsFacade, runRequestService };
  };

  it('enqueues a scheduled Data Quality run with the creator current project role', async () => {
    const { processor, idpProjectionsFacade, runRequestService } = createProcessor();

    await processor.process(createTrigger());

    expect(idpProjectionsFacade.getProjectMemberOrThrow).toHaveBeenCalledWith(
      'project-1',
      'user-1'
    );
    expect(runRequestService.enqueue).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
      },
      'data-mart-1',
      RunType.scheduled
    );
  });

  it('skips an occurrence when another Data Quality run is active', async () => {
    const { processor, runRequestService } = createProcessor();
    runRequestService.enqueue.mockRejectedValue(
      new ConflictException({
        code: 'DATA_QUALITY_RUN_ACTIVE',
        activeRunId: 'active-run-1',
      })
    );

    await expect(processor.process(createTrigger())).resolves.toBeUndefined();
  });

  it('does not swallow other Data Quality eligibility errors', async () => {
    const { processor, runRequestService } = createProcessor();
    const error = new ConflictException({
      code: 'DATA_QUALITY_NO_APPLICABLE_CHECKS',
    });
    runRequestService.enqueue.mockRejectedValue(error);

    await expect(processor.process(createTrigger())).rejects.toBe(error);
  });

  it('rejects an incompatible trigger type before resolving the creator', async () => {
    const { processor, idpProjectionsFacade } = createProcessor();

    await expect(
      processor.process(createTrigger({ type: ScheduledTriggerType.CONNECTOR_RUN }))
    ).rejects.toThrow('Incompatible trigger type CONNECTOR_RUN');
    expect(idpProjectionsFacade.getProjectMemberOrThrow).not.toHaveBeenCalled();
  });

  it('rejects trigger-specific config instead of silently ignoring it', async () => {
    const { processor, runRequestService } = createProcessor();

    await expect(
      processor.process(
        createTrigger({
          triggerConfig: {
            type: 'scheduled-report-run-config',
            reportId: 'report-1',
          },
        })
      )
    ).rejects.toThrow('Trigger config is not allowed for Data Quality run');
    expect(runRequestService.enqueue).not.toHaveBeenCalled();
  });

  it('does not run on behalf of a creator who is no longer a project member', async () => {
    const { processor, idpProjectionsFacade, runRequestService } = createProcessor();
    idpProjectionsFacade.getProjectMemberOrThrow.mockResolvedValue(undefined);

    await expect(processor.process(createTrigger())).rejects.toThrow(
      'User is no longer a member of this project; Data Quality checks cannot run on their behalf'
    );
    expect(runRequestService.enqueue).not.toHaveBeenCalled();
  });

  it('rejects an unsupported current project role at the IDP boundary', async () => {
    const { processor, idpProjectionsFacade, runRequestService } = createProcessor();
    idpProjectionsFacade.getProjectMemberOrThrow.mockResolvedValue({
      userId: 'user-1',
      role: 'owner',
    });

    await expect(processor.process(createTrigger())).rejects.toThrow(
      'User project role is not supported; Data Quality checks cannot run on their behalf'
    );
    expect(runRequestService.enqueue).not.toHaveBeenCalled();
  });
});
