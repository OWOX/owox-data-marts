import { IdpProjectionsFacade } from '../../../../idp/facades/idp-projections.facade';
import { DataMartScheduledTrigger } from '../../../entities/data-mart-scheduled-trigger.entity';
import { DataMart } from '../../../entities/data-mart.entity';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import { DataQualityRunRequestService } from '../../../services/data-quality-run-request.service';
import { ScheduledTriggerType } from '../../enums/scheduled-trigger-type.enum';
import { ScheduledDataQualityRunValidator } from './scheduled-data-quality-run-validator';

describe('ScheduledDataQualityRunValidator', () => {
  const createDataMart = (overrides: Partial<DataMart> = {}): DataMart =>
    Object.assign(
      new DataMart(),
      {
        id: 'data-mart-1',
        projectId: 'project-1',
        schema: { type: 'bigquery-data-mart-schema', fields: [] },
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'SELECT 1' },
      },
      overrides
    );

  const createTrigger = (
    overrides: Partial<DataMartScheduledTrigger> = {}
  ): DataMartScheduledTrigger =>
    Object.assign(
      new DataMartScheduledTrigger(),
      {
        id: 'schedule-1',
        type: ScheduledTriggerType.DATA_QUALITY_RUN,
        createdById: 'user-1',
        dataMart: createDataMart(),
      },
      overrides
    );

  const createValidator = () => {
    const idpProjectionsFacade = {
      getProjectMemberOrThrow: jest.fn().mockResolvedValue({
        userId: 'user-1',
        role: 'editor',
      }),
    };
    const runRequestService = {
      hasApplicableEnabledChecks: jest.fn().mockResolvedValue(true),
    };
    const validator = new ScheduledDataQualityRunValidator(
      idpProjectionsFacade as unknown as IdpProjectionsFacade,
      runRequestService as unknown as DataQualityRunRequestService
    );

    return { validator, idpProjectionsFacade, runRequestService };
  };

  it('accepts a config-less schedule with at least one currently applicable enabled check', async () => {
    const { validator, runRequestService } = createValidator();

    await expect(validator.validate(createTrigger())).resolves.toEqual({ valid: true });
    expect(runRequestService.hasApplicableEnabledChecks).toHaveBeenCalledWith(
      {
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
      },
      'data-mart-1'
    );
  });

  it('rejects trigger-specific config', async () => {
    const { validator, runRequestService } = createValidator();

    await expect(
      validator.validate(
        createTrigger({
          triggerConfig: {
            type: 'scheduled-report-run-config',
            reportId: 'report-1',
          },
        })
      )
    ).resolves.toEqual({
      valid: false,
      errorMessage: 'Trigger config is not allowed for Data Quality run',
    });
    expect(runRequestService.hasApplicableEnabledChecks).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'Output Schema',
      dataMart: { schema: undefined },
      message: 'Scheduled Data Quality run requires an Output Schema',
    },
    {
      name: 'definition',
      dataMart: { definition: undefined },
      message: 'Scheduled Data Quality run requires a Data Mart definition',
    },
    {
      name: 'definition type',
      dataMart: { definitionType: null },
      message: 'Scheduled Data Quality run requires a Data Mart definition',
    },
  ])('rejects a Data Mart without $name', async ({ dataMart, message }) => {
    const { validator } = createValidator();
    const trigger = createTrigger({
      dataMart: createDataMart(dataMart),
    });

    await expect(validator.validate(trigger)).resolves.toEqual({
      valid: false,
      errorMessage: message,
    });
  });

  it('rejects a schedule without an applicable enabled check', async () => {
    const { validator, runRequestService } = createValidator();
    runRequestService.hasApplicableEnabledChecks.mockResolvedValue(false);

    await expect(validator.validate(createTrigger())).resolves.toEqual({
      valid: false,
      errorMessage: 'Scheduled Data Quality run requires at least one applicable enabled check',
    });
  });
});
