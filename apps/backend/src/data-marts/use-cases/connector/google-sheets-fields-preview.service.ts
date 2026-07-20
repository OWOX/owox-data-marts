import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
// @ts-expect-error - Package lacks TypeScript declarations
import { Connectors, Core } from '@owox/connectors';
import { ConnectorFieldsSchema } from '../../connector-types/connector-fields-schema';
import { AuthorizationContext } from '../../../idp';
import { GoogleSheetsPreviewCredentialsService } from '../../services/connector/google-sheets-preview-credentials.service';

interface SourceFieldsSchema {
  [key: string]: {
    overview?: string;
    description?: string;
    documentation?: string;
    uniqueKeys?: string[];
    defaultFields?: string[];
    destinationName?: string;
    fields?: Record<string, { type?: string; description?: string }>;
  };
}

const PREVIEW_TIMEOUT_MS = 15_000;
const GOOGLE_SHEETS_SOURCE_NAME = 'GoogleSheets';

class PreviewTimeoutError extends Error {}

class GoogleSheetsFieldsPreviewConfig extends Core.AbstractConfig {
  private readonly logger: Logger;

  constructor(configData: Record<string, unknown>, logger: Logger) {
    super(configData);
    this.logger = logger;
  }

  handleStatusUpdate(): void {}

  updateLastImportDate(): void {}

  updateLastRequstedDate(): void {}

  isInProgress(): boolean {
    return false;
  }

  addWarningToCurrentStatus(): void {}

  logMessage(message: string): void {
    this.logger.debug(`[${GOOGLE_SHEETS_SOURCE_NAME}] ${message}`);
  }
}

@Injectable()
export class GoogleSheetsFieldsPreviewService {
  private readonly logger = new Logger(GoogleSheetsFieldsPreviewService.name);

  constructor(private readonly previewCredentials: GoogleSheetsPreviewCredentialsService) {}

  async run(
    context: AuthorizationContext,
    configuration: Record<string, unknown>
  ): Promise<ConnectorFieldsSchema> {
    const SourceClass = Connectors[GOOGLE_SHEETS_SOURCE_NAME]?.GoogleSheetsSource;
    if (typeof SourceClass?.prototype?.fetchFieldsSchema !== 'function') {
      throw new InternalServerErrorException('Google Sheets field preview is unavailable');
    }

    let configWithCredentials: Record<string, unknown>;
    try {
      configWithCredentials = await this.previewCredentials.inject(configuration, context);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to resolve credentials for Google Sheets field preview', error);
      throw new InternalServerErrorException('Unable to resolve credentials for field preview');
    }

    const source = this.createSource(configWithCredentials);

    try {
      source.config.validate();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException({ message });
    }

    try {
      const sourceFieldsSchema = (await this.withTimeout(signal =>
        source.fetchFieldsSchema(signal)
      )) as SourceFieldsSchema;
      return ConnectorFieldsSchema.parse(this.mapFieldsSchemaToDto(sourceFieldsSchema));
    } catch (error) {
      throw this.mapPreviewError(error);
    }
  }

  private createSource(configuration: Record<string, unknown>) {
    const SourceClass = Connectors[GOOGLE_SHEETS_SOURCE_NAME].GoogleSheetsSource;
    const sourceConfig = new Core.SourceConfigDto({
      name: GOOGLE_SHEETS_SOURCE_NAME,
      config: configuration,
    });

    return new SourceClass(new GoogleSheetsFieldsPreviewConfig(sourceConfig.config, this.logger));
  }

  private mapFieldsSchemaToDto(sourceFieldsSchema: SourceFieldsSchema) {
    return Object.keys(sourceFieldsSchema).map(key => ({
      name: key,
      overview: sourceFieldsSchema[key].overview,
      description: sourceFieldsSchema[key].description,
      documentation: sourceFieldsSchema[key].documentation,
      uniqueKeys: sourceFieldsSchema[key].uniqueKeys,
      defaultFields: sourceFieldsSchema[key].defaultFields,
      destinationName: sourceFieldsSchema[key].destinationName,
      fields: Object.keys(sourceFieldsSchema[key].fields ?? {}).map(fieldKey => ({
        name: fieldKey,
        type: sourceFieldsSchema[key].fields?.[fieldKey].type,
        description: sourceFieldsSchema[key].fields?.[fieldKey].description,
      })),
    }));
  }

  private async withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const abortController = new AbortController();
    let timeout: NodeJS.Timeout | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        abortController.abort();
        reject(new PreviewTimeoutError('Connector field preview timed out'));
      }, PREVIEW_TIMEOUT_MS);
    });

    try {
      return await Promise.race([work(abortController.signal), deadline]);
    } catch (error) {
      if (abortController.signal.aborted) {
        throw new PreviewTimeoutError('Connector field preview timed out');
      }
      throw error;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private mapPreviewError(error: unknown): HttpException {
    if (error instanceof HttpException) {
      return error;
    }
    if (error instanceof PreviewTimeoutError) {
      return new GatewayTimeoutException('Connector field preview timed out');
    }

    const status = this.extractProviderStatus(error);
    const message = error instanceof Error ? error.message : String(error);
    const normalizedMessage = message.toLowerCase();

    if (status === 401 || this.looksLikeAuthenticationFailure(normalizedMessage)) {
      // The application client reserves HTTP 401 for the OWOX login session.
      return new BadRequestException('Connector credentials are invalid or expired');
    }
    if (status === 403) {
      return new ForbiddenException(message);
    }
    if (status === 400 || status === 404 || this.looksLikeConfigurationFailure(normalizedMessage)) {
      return new BadRequestException({ message });
    }
    if (
      status === 429 ||
      (status !== undefined && status >= 500) ||
      this.isProviderRequestError(error)
    ) {
      return new BadGatewayException('Connector provider is temporarily unavailable');
    }

    this.logger.error('Unexpected Google Sheets field preview failure', error);
    return new InternalServerErrorException('Unable to preview connector fields');
  }

  private extractProviderStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const record = error as Record<string, unknown>;
    for (const value of [record.statusCode, record.status]) {
      if (typeof value === 'number') {
        return value;
      }
    }

    if (record.response && typeof record.response === 'object') {
      const responseStatus = (record.response as Record<string, unknown>).status;
      if (typeof responseStatus === 'number') {
        return responseStatus;
      }
    }

    return this.extractProviderStatus(record.cause);
  }

  private isProviderRequestError(error: unknown): boolean {
    return error instanceof Error && error.name === 'HttpRequestException';
  }

  private looksLikeAuthenticationFailure(message: string): boolean {
    return [
      'access token',
      'authentication failed',
      'failed to get access token',
      'invalid credential',
      'invalid_grant',
      'token error',
    ].some(fragment => message.includes(fragment));
  }

  private looksLikeConfigurationFailure(message: string): boolean {
    return [
      'no headers found',
      'no columns selected',
      'header row',
      'spreadsheet not found',
      'sheet not found',
      'unsupported google sheets authentication type',
    ].some(fragment => message.includes(fragment));
  }
}
