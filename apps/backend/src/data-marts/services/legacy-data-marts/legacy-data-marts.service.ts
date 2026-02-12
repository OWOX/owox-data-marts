import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithBackoff, ImpersonatedIdTokenFetcher } from '@owox/internal-helpers';
import { z } from 'zod';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import {
  CreateDataMartOdmRequestDto,
  CreateDataMartOdmRequestSchema,
} from '../../dto/domain/legacy-data-marts/create-data-mart-odm.request.dto';
import {
  CreateDataMartOdmResponseDto,
  CreateDataMartOdmResponseSchema,
} from '../../dto/domain/legacy-data-marts/create-data-mart-odm.response.dto';
import {
  DataMartsDetailsOdmResponseDto,
  DataMartsDetailsOdmResponseSchema,
} from '../../dto/domain/legacy-data-marts/data-mart-details-odm.response.dto';
import { ParsedQueryOdmResponseSchema } from '../../dto/domain/legacy-data-marts/parsed-query-odm.response.dto';

@Injectable()
export class LegacyDataMartsService {
  private readonly logger = new Logger(LegacyDataMartsService.name);
  private readonly impersonatedIdTokenFetcher = new ImpersonatedIdTokenFetcher();

  private readonly baseUrl: string | undefined;
  private readonly targetAudience: string | undefined;
  private readonly serviceAccountEmail: string | undefined;
  private readonly isLegacyOdmServiceConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    this.serviceAccountEmail = this.configService.get<string>(
      'LEGACY_DATA_MARTS_ENDPOINT_AUTH_SERVICE_ACCOUNT'
    );
    this.targetAudience = this.configService.get<string>(
      'LEGACY_DATA_MARTS_ENDPOINT_TARGET_AUDIENCE'
    );
    this.baseUrl = this.configService.get<string>('LEGACY_DATA_MARTS_ENDPOINT_BASE_URL');

    if (this.baseUrl && this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }

    if (!this.baseUrl && !this.serviceAccountEmail && !this.targetAudience) {
      this.isLegacyOdmServiceConfigured = false;
      this.logger.log('Legacy ODM service is not configured. Skipping legacy data marts requests.');
      return;
    }

    if (!this.baseUrl || !this.serviceAccountEmail || !this.targetAudience) {
      throw new Error(
        'Legacy ODM service is partially configured. Please check the following environment variables: LEGACY_DATA_MARTS_ENDPOINT_BASE_URL, LEGACY_DATA_MARTS_ENDPOINT_AUTH_SERVICE_ACCOUNT, LEGACY_DATA_MARTS_ENDPOINT_TARGET_AUDIENCE'
      );
    }

    this.isLegacyOdmServiceConfigured = true;
  }

  public async getGcpProjectsList(biProject: string): Promise<string[]> {
    this.ensureConfigured();

    const response = await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/${biProject}/gcp`, {
      method: 'GET',
    });
    const data = await response.json();
    return z.array(z.string()).parse(data);
  }

  public async getDataMartsList(gcpProjectId: string): Promise<string[]> {
    this.ensureConfigured();

    const response = await this.fetchLegacyOdmApi(
      `${this.baseUrl}/odm/gcp/${gcpProjectId}/data-marts`,
      {
        method: 'GET',
      }
    );
    const data = await response.json();
    return z.array(z.string()).parse(data);
  }

  public async getDataMartDetails(dataMartId: string): Promise<DataMartsDetailsOdmResponseDto> {
    this.ensureConfigured();

    const response = await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/data-marts/${dataMartId}`, {
      method: 'GET',
    });
    const data = await response.json();
    return DataMartsDetailsOdmResponseSchema.parse(data);
  }

  public async createDataMart(
    request: CreateDataMartOdmRequestDto
  ): Promise<CreateDataMartOdmResponseDto> {
    this.ensureConfigured();

    const payload = CreateDataMartOdmRequestSchema.parse(request);
    const response = await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/data-marts`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    return CreateDataMartOdmResponseSchema.parse(data);
  }

  public async updateTitle(dataMartId: string, title: string): Promise<void> {
    this.ensureConfigured();

    await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/data-marts/${dataMartId}/title`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ title }),
    });
  }

  public async updateDescription(dataMartId: string, description: string): Promise<void> {
    this.ensureConfigured();

    await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/data-marts/${dataMartId}/description`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ description }),
    });
  }

  public async updateQuery(dataMartId: string, query: string): Promise<void> {
    this.ensureConfigured();

    await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/data-marts/${dataMartId}/query`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ query }),
    });
  }

  public async deleteDataMart(dataMartId: string): Promise<void> {
    this.ensureConfigured();

    await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/data-marts/${dataMartId}`, {
      method: 'DELETE',
    });
  }

  public async parseQuery(query: string): Promise<string> {
    this.ensureConfigured();

    const response = await this.fetchLegacyOdmApi(`${this.baseUrl}/odm/parse-query`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ query }),
    });
    const data = await response.json();
    const parsingResult = ParsedQueryOdmResponseSchema.parse(data);

    if (parsingResult.error) {
      throw new BusinessViolationException(
        `Failed to parse query: ${JSON.stringify(parsingResult.error)}`
      );
    }

    return parsingResult.parsedQuery ?? query;
  }

  public isDataMartIdLooksLikeLegacy(dataMartId: string): boolean {
    // Legacy data mart ID looks like MD5 hash: 32 hex characters without any separators
    return dataMartId.length === 32 && /^[a-f0-9]+$/.test(dataMartId);
  }

  private ensureConfigured(): void {
    if (!this.isLegacyOdmServiceConfigured) {
      throw new Error(
        'Legacy ODM service is not configured. Please set LEGACY_DATA_MARTS_ENDPOINT_BASE_URL, LEGACY_DATA_MARTS_ENDPOINT_AUTH_SERVICE_ACCOUNT, LEGACY_DATA_MARTS_ENDPOINT_TARGET_AUDIENCE.'
      );
    }
  }

  private async fetchLegacyOdmApi(url: string, options: RequestInit): Promise<Response> {
    const idToken = await this.impersonatedIdTokenFetcher.getIdToken(
      this.serviceAccountEmail!,
      this.targetAudience!
    );
    const response = await fetchWithBackoff(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${idToken}`,
        Accept: 'application/json',
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new NotFoundException('Legacy Data Mart not found');
      }

      const errorBody = await response.text();
      if (response.status >= 400 && response.status < 500) {
        throw new BusinessViolationException(errorBody, { status: response.status });
      }
      const errorMessage = `Legacy ODM API request failed with status ${response.status}. Response: ${errorBody}`;
      this.logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return response;
  }
}
