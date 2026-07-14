const validateMock = jest.fn();
const fetchFieldsSchemaMock = jest.fn();

jest.mock('@owox/connectors', () => {
  class AbstractConfig {
    constructor(configData: Record<string, unknown>) {
      Object.assign(this, configData);
    }

    validate() {
      return validateMock();
    }
  }

  class SourceConfigDto {
    config: Record<string, unknown>;

    constructor(data: { config: Record<string, unknown> }) {
      this.config = data.config;
    }
  }

  class GoogleSheetsSource {
    constructor(public readonly config: AbstractConfig) {}

    fetchFieldsSchema(signal?: AbortSignal) {
      return fetchFieldsSchemaMock(signal);
    }
  }

  class OpenHolidaysSource {
    constructor(public readonly config: AbstractConfig) {}
  }

  return {
    AvailableConnectors: ['GoogleSheets', 'OpenHolidays'],
    Connectors: {
      GoogleSheets: { GoogleSheetsSource },
      OpenHolidays: { OpenHolidaysSource },
    },
    Core: { AbstractConfig, SourceConfigDto },
  };
});

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConnectorCredentialInjectorService } from '../../services/connector/connector-credential-injector.service';
import { PreviewFieldsConnectorService } from './preview-fields-connector.service';

describe('PreviewFieldsConnectorService', () => {
  const createService = () => {
    const credentialInjector = {
      injectCredentialsForPreview: jest
        .fn()
        .mockImplementation((config: Record<string, unknown>) => Promise.resolve(config)),
    } as unknown as ConnectorCredentialInjectorService;

    return {
      service: new PreviewFieldsConnectorService(credentialInjector),
      credentialInjector,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    validateMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a successful mocked dynamic fields preview', async () => {
    const { service, credentialInjector } = createService();
    fetchFieldsSchemaMock.mockResolvedValue({
      sheet: {
        overview: 'Sheet columns',
        uniqueKeys: ['_owox_row_number'],
        defaultFields: ['product', 'amount'],
        fields: {
          product: { type: 'STRING' },
          amount: { type: 'NUMBER' },
        },
      },
    });

    const result = await service.run('GoogleSheets', 'project-1', {
      SpreadsheetId: 'sheet-1',
    });

    expect(credentialInjector.injectCredentialsForPreview).toHaveBeenCalledWith(
      { SpreadsheetId: 'sheet-1' },
      'GoogleSheets',
      'project-1'
    );
    expect(result).toEqual([
      expect.objectContaining({
        name: 'sheet',
        defaultFields: ['product', 'amount'],
        fields: [
          expect.objectContaining({ name: 'product', type: 'STRING' }),
          expect.objectContaining({ name: 'amount', type: 'NUMBER' }),
        ],
      }),
    ]);
  });

  it('maps provider failures to Bad Gateway', async () => {
    const { service } = createService();
    const providerError = Object.assign(new Error('upstream unavailable'), {
      name: 'HttpRequestException',
      statusCode: 503,
    });
    fetchFieldsSchemaMock.mockRejectedValue(providerError);

    await expect(service.run('GoogleSheets', 'project-1', {})).rejects.toThrow(BadGatewayException);
  });

  it('does not expose provider authentication failures as an application 401', async () => {
    const { service } = createService();
    const providerError = Object.assign(new Error('invalid_grant'), {
      name: 'HttpRequestException',
      statusCode: 401,
    });
    fetchFieldsSchemaMock.mockRejectedValue(providerError);

    const preview = service.run('GoogleSheets', 'project-1', {});
    await expect(preview).rejects.toBeInstanceOf(BadRequestException);
    await expect(preview).rejects.toThrow('Connector credentials are invalid or expired');
  });

  it('preserves the actionable provider message for access-denied failures', async () => {
    const { service } = createService();
    const providerError = Object.assign(
      new Error(
        'Google Sheets access denied: Share the spreadsheet with service-account@example.com.'
      ),
      { name: 'HttpRequestException', statusCode: 403 }
    );
    fetchFieldsSchemaMock.mockRejectedValue(providerError);

    const preview = service.run('GoogleSheets', 'project-1', {});
    await expect(preview).rejects.toBeInstanceOf(ForbiddenException);
    await expect(preview).rejects.toThrow(providerError.message);
  });

  it('maps unexpected backend failures to Internal Server Error', async () => {
    const { service } = createService();
    fetchFieldsSchemaMock.mockRejectedValue(new Error('unexpected mapper bug'));

    await expect(service.run('GoogleSheets', 'project-1', {})).rejects.toThrow(
      InternalServerErrorException
    );
  });

  it('bounds preview work with a backend timeout', async () => {
    jest.useFakeTimers();
    const { service } = createService();
    let previewSignal: AbortSignal | undefined;
    fetchFieldsSchemaMock.mockImplementation((signal: AbortSignal) => {
      previewSignal = signal;
      return new Promise(() => undefined);
    });

    const preview = service.run('GoogleSheets', 'project-1', {});
    const rejection = expect(preview).rejects.toThrow(GatewayTimeoutException);
    await jest.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(previewSignal?.aborted).toBe(true);
  });
});
