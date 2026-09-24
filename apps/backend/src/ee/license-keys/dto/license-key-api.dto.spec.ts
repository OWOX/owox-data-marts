import { ValidationPipe } from '@nestjs/common';
import {
  REPORT_RUN_KINDS,
  RunKind,
} from '../../../data-marts/services/project-billing/project-billing.service';
import { DataDestinationType } from '../../../data-marts/data-destination-types/enums/data-destination-type.enum';
import { DataStorageType } from '../../../data-marts/data-storage-types/enums/data-storage-type.enum';
import { LicenseConsumptionRequestDto } from './license-key-api.dto';

describe('LicenseConsumptionRequestDto', () => {
  // Must stay in sync with setupGlobalPipes in src/config/global-pipes.config.ts.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const metadata = { type: 'body' as const, metatype: LicenseConsumptionRequestDto };
  const basePayload = {
    projectId: 'p-1',
    dataMartId: 'dm-1',
    dataStorageId: 'storage-1',
    dataStorageType: DataStorageType.GOOGLE_BIGQUERY,
    runTime: '2026-08-12T12:00:00.000Z',
  };
  const payloadByKind: Record<RunKind, Record<string, unknown>> = {
    [RunKind.SHEETS_REPORT_RUN]: {
      ...basePayload,
      reportId: 'report-1',
      reportRunId: 'run-1',
      dataDestinationId: 'destination-1',
      dataDestinationType: DataDestinationType.GOOGLE_SHEETS,
      googleSheetsDocumentId: 'spreadsheet-1',
      googleSheetsListId: 123,
    },
    [RunKind.LOOKER_REPORT_RUN]: {
      ...basePayload,
      reportId: 'report-1',
      reportRunId: 'run-1',
      dataDestinationId: 'destination-1',
      dataDestinationType: DataDestinationType.LOOKER_STUDIO,
    },
    [RunKind.EXCEL_REPORT_RUN]: {
      ...basePayload,
      reportId: 'report-1',
      reportRunId: 'run-1',
      dataDestinationId: 'destination-1',
      dataDestinationType: DataDestinationType.EXCEL,
    },
    [RunKind.EMAIL_BASED_REPORT_RUN]: {
      ...basePayload,
      reportId: 'report-1',
      reportRunId: 'run-1',
      dataDestinationId: 'destination-1',
      dataDestinationType: DataDestinationType.SLACK,
    },
    [RunKind.HTTP_DATA_RUN]: { ...basePayload, reportRunId: 'run-1' },
    [RunKind.MCP_QUERY_RUN]: { ...basePayload, runId: 'run-1' },
    [RunKind.CONNECTOR_RUN]: {},
    [RunKind.DATA_QUALITY_RUN]: {},
    [RunKind.AI_PROCESS_RUN]: {},
  };

  it.each(REPORT_RUN_KINDS)('accepts a forwarded %s consumption request', async kind => {
    await expect(
      pipe.transform({ kind, payload: payloadByKind[kind] }, metadata)
    ).resolves.toMatchObject({
      kind,
      payload: payloadByKind[kind],
    });
  });

  it('keeps additive fields for rolling deployment compatibility', async () => {
    const payload = { ...payloadByKind[RunKind.MCP_QUERY_RUN], futureField: 'future-value' };

    await expect(
      pipe.transform({ kind: RunKind.MCP_QUERY_RUN, payload }, metadata)
    ).resolves.toMatchObject({ payload });
  });

  it('rejects a payload without the kind-specific run id', async () => {
    await expect(
      pipe.transform({ kind: RunKind.MCP_QUERY_RUN, payload: basePayload }, metadata)
    ).rejects.toThrow();
  });

  it('rejects a destination type that does not match the run kind', async () => {
    await expect(
      pipe.transform(
        {
          kind: RunKind.LOOKER_REPORT_RUN,
          payload: {
            ...payloadByKind[RunKind.LOOKER_REPORT_RUN],
            dataDestinationType: DataDestinationType.SLACK,
          },
        },
        metadata
      )
    ).rejects.toThrow();
  });

  it('rejects an unknown kind', async () => {
    await expect(
      pipe.transform({ kind: 'NOT_A_RUN_KIND', payload: {} }, metadata)
    ).rejects.toThrow();
  });

  it.each([RunKind.CONNECTOR_RUN, RunKind.DATA_QUALITY_RUN, RunKind.AI_PROCESS_RUN])(
    'rejects the process run kind %s',
    async kind => {
      await expect(pipe.transform({ kind, payload: {} }, metadata)).rejects.toThrow();
    }
  );

  it('rejects a non-object payload', async () => {
    await expect(
      pipe.transform({ kind: RunKind.MCP_QUERY_RUN, payload: 'oops' }, metadata)
    ).rejects.toThrow();
  });
});
