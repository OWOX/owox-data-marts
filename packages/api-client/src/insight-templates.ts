import { OWOXApiError } from './errors.js';

export type OWOXProjectInsightTemplateDataMartRef = {
  id: string;
  title: string;
};

export type OWOXProjectInsightTemplateUser = {
  userId: string;
  fullName?: string | null;
  email?: string | null;
  avatar?: string | null;
};

export type OWOXProjectInsightTemplate = {
  id: string;
  title: string;
  sourcesCount: number;
  lastRenderedTemplateUpdatedAt: string | null;
  createdById: string;
  createdAt: string;
  modifiedAt: string;
  createdByUser?: OWOXProjectInsightTemplateUser | null;
  dataMart: OWOXProjectInsightTemplateDataMartRef;
  canDelete: boolean;
};

export type OWOXProjectInsightTemplatesResponse = {
  insights: OWOXProjectInsightTemplate[];
};

export type OWOXProjectInsightTemplateListOptions = {
  limit?: number;
  offset?: number;
};

type InsightTemplatesRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableUser(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (isRecord(value) &&
      typeof value.userId === 'string' &&
      isOptionalNullableString(value.fullName) &&
      isOptionalNullableString(value.email) &&
      isOptionalNullableString(value.avatar))
  );
}

function isProjectInsightTemplate(value: unknown): value is OWOXProjectInsightTemplate {
  if (!isRecord(value) || !isRecord(value.dataMart)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.sourcesCount === 'number' &&
    Number.isInteger(value.sourcesCount) &&
    value.sourcesCount >= 0 &&
    isOptionalNullableString(value.lastRenderedTemplateUpdatedAt) &&
    value.lastRenderedTemplateUpdatedAt !== undefined &&
    typeof value.createdById === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.modifiedAt === 'string' &&
    isOptionalNullableUser(value.createdByUser) &&
    typeof value.dataMart.id === 'string' &&
    typeof value.dataMart.title === 'string' &&
    typeof value.canDelete === 'boolean'
  );
}

function parseProjectInsightTemplates(response: unknown): OWOXProjectInsightTemplatesResponse {
  if (
    !isRecord(response) ||
    !Array.isArray(response.insights) ||
    !response.insights.every(isProjectInsightTemplate)
  ) {
    throw new OWOXApiError(
      'OWOX Project Insight Templates API returned an unexpected response shape',
      { details: response }
    );
  }

  return response as OWOXProjectInsightTemplatesResponse;
}

export class InsightTemplatesApi {
  constructor(private readonly requester: InsightTemplatesRequester) {}

  async list(
    options: OWOXProjectInsightTemplateListOptions = {}
  ): Promise<OWOXProjectInsightTemplatesResponse> {
    const query = {
      ...(options.limit === undefined ? {} : { limit: String(options.limit) }),
      ...(options.offset === undefined ? {} : { offset: String(options.offset) }),
    };

    return parseProjectInsightTemplates(
      await this.requester.getJson<unknown>(
        '/api/data-marts/insight-templates',
        Object.keys(query).length === 0 ? undefined : query
      )
    );
  }
}
