jest.mock('../../observability/log-mcp-tool-error', () => ({ logMcpToolError: jest.fn() }));
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataMartValidationCode } from '../../../../data-marts/data-storage-types/interfaces/data-mart-validator.interface';
import { dataMartToolCall } from './data-mart-tool-error';
import { dataMartExecutionToolCall } from '../data-mart-execution/data-mart-execution-tool-error';
import { parseManualBackfillRange } from '../../../../data-marts/utils/manual-backfill-range';

describe('Data Mart diagnostics', () => {
  it('turns the stale-page error into MCP recovery steps without exposing details', async () => {
    const error = await dataMartToolCall(async () => {
      throw new BadRequestException({
        message: 'This page is out of date. Reload it.',
        details: { token: 'private-diagnostic-value' },
      });
    }).catch(value => value);

    expect(error.getStatus()).toBe(400);
    expect(error.message).toContain('get_data_mart_setup');
    expect(error.message).toContain('_id');
    expect(error.message).toContain('_credential_id');
    expect(error.message).toContain('Do not send secret values.');
    expect(error.message).not.toContain('Reload');
    expect(JSON.stringify(error.getResponse())).not.toContain('private-diagnostic-value');
  });

  it('preserves a conflict status without claiming a specific conflict cause', async () => {
    const error = await dataMartToolCall(async () => {
      throw new ConflictException('provider secret');
    }).catch(value => value);
    expect(error.getStatus()).toBe(409);
    expect(error.message).toContain('current Data Mart state');
    expect(error.message).not.toContain('changed');
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
  });
  it.each([
    'Input source type cannot be changed to or from a connector. Create a separate Data Mart instead.',
    'Select a Credential for each configuration.',
    'Use only declared non-secret connector fields and saved Credential IDs',
    'Select credentials with credential_id',
  ])('keeps an actionable application message: %s', async message => {
    const error = await dataMartToolCall(async () => {
      throw new BusinessViolationException(message, { token: 'private-diagnostic-value' });
    }).catch(value => value);
    expect(error.message).toBe(message);
    expect(JSON.stringify(error.getResponse())).not.toContain('private-diagnostic-value');
  });

  it.each([
    [{ StartDate: '2026-1-5' }, 'StartDate is required in YYYY-MM-DD format'],
    [{ StartDate: '2026-01-05', EndDate: '2026-2-1' }, 'EndDate must be in YYYY-MM-DD format'],
    [{ StartDate: '2027-01-01' }, 'StartDate cannot be in the future'],
    [{ StartDate: '1999-01-01' }, 'StartDate cannot be earlier than 2000-01-01'],
    [
      { StartDate: '2026-02-01', EndDate: '2026-01-01' },
      'EndDate cannot be earlier than StartDate',
    ],
  ])('keeps the existing backfill validation actionable: %p', async (data, message) => {
    const error = await dataMartExecutionToolCall(async () =>
      parseManualBackfillRange(data, new Date('2026-11-06T00:00:00Z'))
    ).catch(value => value);
    expect(error.getStatus()).toBe(400);
    expect(error.message).toBe(message);
  });

  it('returns a known validation reason without echoing error text or details', async () => {
    const error = await dataMartToolCall(async () => {
      throw new BusinessViolationException(
        'provider secret',
        { token: 'secret' },
        DataMartValidationCode.STORAGE_CREDENTIALS_NOT_FOUND
      );
    }).catch(value => value);
    expect(error.message).toMatch(/Credential/);
    expect(error.message).not.toContain('secret');
    expect(error.message).not.toContain('Connector configurations');
  });

  it('explains formula reference syntax without exposing the formula or field names', async () => {
    const error = await dataMartToolCall(async () => {
      throw new BusinessViolationException('Calculated field validation failed', {
        errors: [
          {
            code: 'FORMULA_AGGREGATE_WITHOUT_FIELD',
            field: 'private-diagnostic-value',
            subject: 'private-diagnostic-value',
            message: 'private-diagnostic-value',
          },
        ],
      });
    }).catch(value => value);
    expect(error.getStatus()).toBe(400);
    expect(error.message).toContain('{{ref field=');
    expect(JSON.stringify(error.getResponse())).not.toContain('private-diagnostic-value');
  });

  it('keeps the single-configuration reason while discarding the connector name', async () => {
    const error = await dataMartToolCall(async () => {
      throw new BadRequestException({
        message: "Connector 'secret' requires exactly one source configuration",
        code: 'DATA_MART_SINGLE_SOURCE_CONFIGURATION_REQUIRED',
        token: 'secret',
      });
    }).catch(value => value);
    expect(error.message).toMatch(/exactly one source configuration/);
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
  });

  it.each([
    new BadRequestException('Invalid config: password=secret'),
    new BusinessViolationException('Invalid config: password=secret'),
    new BusinessViolationException('provider secret', undefined, 'UNKNOWN_CODE'),
    new BusinessViolationException('provider secret', undefined, 'constructor'),
  ])('does not treat an arbitrary bad request as safe: %p', async failure => {
    const error = await dataMartToolCall(async () => {
      throw failure;
    }).catch(value => value);
    expect(error.getStatus()).toBe(400);
    expect(JSON.stringify(error.getResponse())).not.toContain('secret');
  });
});
