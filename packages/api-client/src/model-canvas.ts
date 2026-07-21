import { OWOXApiError } from './errors.js';

export type OWOXModelCanvasNode = {
  id: string;
  title: string;
  status: 'DRAFT' | 'PUBLISHED';
  description: string | null;
  fieldCount: number;
};

export type OWOXModelCanvasDataMartsPage = {
  items: OWOXModelCanvasNode[];
  total: number;
  nextOffset: number | null;
};

export type OWOXModelCanvasJoinCondition = {
  sourceFieldName: string;
  targetFieldName: string;
};

export type OWOXModelCanvasEdge = {
  id: string;
  sourceDataMartId: string;
  targetDataMartId: string;
  joinConditions: OWOXModelCanvasJoinCondition[];
};

type ModelCanvasRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNode(value: unknown): value is OWOXModelCanvasNode {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.status === 'DRAFT' || value.status === 'PUBLISHED') &&
    (typeof value.description === 'string' || value.description === null) &&
    typeof value.fieldCount === 'number'
  );
}

function isJoinCondition(value: unknown): value is OWOXModelCanvasJoinCondition {
  return (
    isRecord(value) &&
    typeof value.sourceFieldName === 'string' &&
    typeof value.targetFieldName === 'string'
  );
}

function isEdge(value: unknown): value is OWOXModelCanvasEdge {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.sourceDataMartId === 'string' &&
    typeof value.targetDataMartId === 'string' &&
    Array.isArray(value.joinConditions) &&
    value.joinConditions.every(isJoinCondition)
  );
}

function parseDataMartsPage(response: unknown): OWOXModelCanvasDataMartsPage {
  if (
    !isRecord(response) ||
    !Array.isArray(response.items) ||
    !response.items.every(isNode) ||
    typeof response.total !== 'number' ||
    (typeof response.nextOffset !== 'number' && response.nextOffset !== null)
  ) {
    throw new OWOXApiError(
      'OWOX Model Canvas data marts API returned an unexpected response shape',
      {
        details: response,
      }
    );
  }

  return response as OWOXModelCanvasDataMartsPage;
}

function parseEdges(response: unknown): OWOXModelCanvasEdge[] {
  if (!isRecord(response) || !Array.isArray(response.edges) || !response.edges.every(isEdge)) {
    throw new OWOXApiError('OWOX Model Canvas edges API returned an unexpected response shape', {
      details: response,
    });
  }

  return response.edges;
}

export class ModelCanvasApi {
  constructor(private readonly requester: ModelCanvasRequester) {}

  async getDataMarts(storageId: string, offset?: number): Promise<OWOXModelCanvasDataMartsPage> {
    return parseDataMartsPage(
      await this.requester.getJson<unknown>('/api/model-canvas/data-marts', {
        storageId,
        ...(offset === undefined ? {} : { offset: String(offset) }),
      })
    );
  }

  async getEdges(storageId: string): Promise<OWOXModelCanvasEdge[]> {
    return parseEdges(
      await this.requester.getJson<unknown>('/api/model-canvas/edges', { storageId })
    );
  }
}
