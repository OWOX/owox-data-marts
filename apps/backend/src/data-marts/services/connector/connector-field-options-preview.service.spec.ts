const fetchFieldOptionsMock = jest.fn();

jest.mock('@owox/connectors', () => {
  class AbstractConfig {
    constructor(configData: Record<string, unknown>) {
      Object.assign(this, configData);
    }

    validate() {
      throw new Error('validate must not be called for a field options preview');
    }
  }

  class SourceConfigDto {
    config: Record<string, unknown>;

    constructor(data: { config: Record<string, unknown> }) {
      this.config = data.config;
    }
  }

  class ConnectorConfigurationException extends Error {}

  class GoogleSheetsSource {
    constructor(public readonly config: AbstractConfig) {}

    fetchFieldOptions(field: string, signal?: AbortSignal) {
      return fetchFieldOptionsMock(field, signal);
    }
  }

  class OpenHolidaysSource {
    constructor(public readonly config: AbstractConfig) {}
  }

  return {
    Connectors: {
      GoogleSheets: { GoogleSheetsSource },
      OpenHolidays: { OpenHolidaysSource },
    },
    Core: { AbstractConfig, SourceConfigDto, ConnectorConfigurationException },
  };
});

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AuthorizationContext } from '../../../idp';
import { ConnectorPreviewCredentialsService } from './connector-preview-credentials.service';
import { ConnectorFieldOptionsPreviewService } from './connector-field-options-preview.service';

describe(ConnectorFieldOptionsPreviewService.name, () => {
  const context: AuthorizationContext = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
  };

  const createService = (
    inject: jest.Mock = jest
      .fn()
      .mockImplementation((_connectorName: string, config: Record<string, unknown>) =>
        Promise.resolve(config)
      )
  ) => {
    const previewCredentials = { inject } as unknown as ConnectorPreviewCredentialsService;

    return {
      service: new ConnectorFieldOptionsPreviewService(previewCredentials),
      previewCredentials,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the options resolved by the connector without validating the whole configuration', async () => {
    const { service, previewCredentials } = createService();
    fetchFieldOptionsMock.mockResolvedValue([
      { value: 'Summary', label: 'Summary' },
      { value: 'Data', label: 'Data' },
    ]);

    const result = await service.run(context, 'GoogleSheets', 'SheetName', {
      SpreadsheetId: 'sheet-1',
    });

    expect(previewCredentials.inject).toHaveBeenCalledWith(
      'GoogleSheets',
      { SpreadsheetId: 'sheet-1' },
      context
    );
    expect(fetchFieldOptionsMock).toHaveBeenCalledWith('SheetName', expect.any(AbortSignal));
    expect(result).toEqual([
      { value: 'Summary', label: 'Summary' },
      { value: 'Data', label: 'Data' },
    ]);
  });

  it('rejects connectors that do not support dynamic field options', async () => {
    const { service } = createService();

    await expect(service.run(context, 'OpenHolidays', 'Country', {})).rejects.toThrow(
      "Connector 'OpenHolidays' does not support dynamic field options"
    );
    await expect(service.run(context, 'MissingConnector', 'Country', {})).rejects.toThrow(
      BadRequestException
    );
  });

  it('maps connector configuration failures, such as an unknown field, to Bad Request', async () => {
    const { service } = createService();
    const { Core } = jest.requireMock('@owox/connectors') as {
      Core: { ConnectorConfigurationException: new (message: string) => Error };
    };
    fetchFieldOptionsMock.mockRejectedValue(
      new Core.ConnectorConfigurationException("Field 'Range' does not provide dynamic options")
    );

    const preview = service.run(context, 'GoogleSheets', 'Range', {});
    await expect(preview).rejects.toBeInstanceOf(BadRequestException);
    await expect(preview).rejects.toThrow("Field 'Range' does not provide dynamic options");
  });

  it('passes credential access failures through unchanged', async () => {
    const { service } = createService(
      jest.fn().mockRejectedValue(new ForbiddenException('The selected credentials cannot be used'))
    );

    await expect(service.run(context, 'GoogleSheets', 'SheetName', {})).rejects.toThrow(
      ForbiddenException
    );
    expect(fetchFieldOptionsMock).not.toHaveBeenCalled();
  });

  it('does not expose provider authentication failures as an application 401', async () => {
    const { service } = createService();
    fetchFieldOptionsMock.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), { name: 'HttpRequestException', statusCode: 401 })
    );

    const preview = service.run(context, 'GoogleSheets', 'SheetName', {});
    await expect(preview).rejects.toBeInstanceOf(BadRequestException);
    await expect(preview).rejects.toThrow('Connector credentials are invalid or expired');
  });

  it('maps provider outages to Bad Gateway and unexpected failures to Internal Server Error', async () => {
    const { service } = createService();
    fetchFieldOptionsMock.mockRejectedValueOnce(
      Object.assign(new Error('upstream unavailable'), {
        name: 'HttpRequestException',
        statusCode: 503,
      })
    );
    await expect(service.run(context, 'GoogleSheets', 'SheetName', {})).rejects.toThrow(
      BadGatewayException
    );

    fetchFieldOptionsMock.mockRejectedValueOnce(new Error('unexpected mapper bug'));
    await expect(service.run(context, 'GoogleSheets', 'SheetName', {})).rejects.toThrow(
      InternalServerErrorException
    );
  });

  it('rejects malformed connector responses', async () => {
    const { service } = createService();
    fetchFieldOptionsMock.mockResolvedValue([{ value: 1 }]);

    await expect(service.run(context, 'GoogleSheets', 'SheetName', {})).rejects.toThrow(
      InternalServerErrorException
    );
  });

  it('bounds the lookup with the backend preview timeout', async () => {
    jest.useFakeTimers();
    const { service } = createService();
    let previewSignal: AbortSignal | undefined;
    fetchFieldOptionsMock.mockImplementation((_field: string, signal: AbortSignal) => {
      previewSignal = signal;
      return new Promise(() => undefined);
    });

    const preview = service.run(context, 'GoogleSheets', 'SheetName', {});
    const rejection = expect(preview).rejects.toThrow(GatewayTimeoutException);
    await jest.advanceTimersByTimeAsync(15_000);

    await rejection;
    expect(previewSignal?.aborted).toBe(true);
  });
});
