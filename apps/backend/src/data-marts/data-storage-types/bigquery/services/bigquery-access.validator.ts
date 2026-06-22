import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { BigQueryConfigSchema } from '../schemas/bigquery-config.schema';
import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryServiceAccountCredentialsSchema,
  BigQueryOAuthCredentials,
} from '../schemas/bigquery-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';

const GOOGLE_OAUTH_REAUTH_MESSAGE =
  'Google authorization could not be refreshed. Reconnect this Storage to restore access.';

interface GoogleAuthErrorBody {
  code?: number;
  response?: {
    status?: number;
    data?: {
      error?: unknown;
      error_description?: unknown;
    };
  };
}

function isInvalidGoogleAuthError(error: unknown): boolean {
  const body = error as GoogleAuthErrorBody | null;
  const httpStatus = body?.code ?? body?.response?.status;
  const data = body?.response?.data;
  const googleError = data?.error;
  const googleErrorDescription = data?.error_description;
  const message = error instanceof Error ? error.message : String(error);

  return (
    // Structured: HTTP 401 from the BigQuery API (invalid or revoked access token)
    httpStatus === 401 ||
    // Structured: OAuth token endpoint signals a revoked/expired refresh token
    googleError === 'invalid_grant' ||
    (typeof googleErrorDescription === 'string' &&
      googleErrorDescription.includes('invalid_grant')) ||
    // Fallback: message-based detection for clients that surface the error differently
    message.includes('invalid_grant') ||
    message.includes('Request had invalid authentication credentials') ||
    message.includes('Expected OAuth 2 access token')
  );
}

@Injectable()
export class BigQueryAccessValidator implements DataStorageAccessValidator {
  readonly logger = new Logger(BigQueryAccessValidator.name);
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  async validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const configOpt = BigQueryConfigSchema.safeParse(config);
    if (!configOpt.success) {
      this.logger.warn('Invalid config', configOpt.error);
      return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
    }

    const bigQueryConfig = configOpt.data;

    if ((credentials as BigQueryOAuthCredentials).type === BIGQUERY_OAUTH_TYPE) {
      const apiAdapter = new BigQueryApiAdapter(
        credentials as BigQueryOAuthCredentials,
        bigQueryConfig
      );
      try {
        await apiAdapter.checkAccess();
        return new ValidationResult(true);
      } catch (error) {
        this.logger.warn('OAuth access validation failed', error);
        if (isInvalidGoogleAuthError(error)) {
          return ValidationResult.oauthReauthRequired(GOOGLE_OAUTH_REAUTH_MESSAGE);
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        return new ValidationResult(false, errorMessage);
      }
    }

    const credentialsOpt = BigQueryServiceAccountCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const apiAdapter = new BigQueryApiAdapter(credentialsOpt.data, bigQueryConfig);
    try {
      await apiAdapter.checkAccess();
      return new ValidationResult(true);
    } catch (error) {
      this.logger.warn('Access validation failed', error);
      return new ValidationResult(false, 'Access validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
