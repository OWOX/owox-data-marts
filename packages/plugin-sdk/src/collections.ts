import type { OWOXApiClient } from '@owox/api-client';
import { PluginTransportError } from './iframe-transport.js';

const COLLECTIONS_API_PATH = '/api/plugins/runtime/collections';

export interface PluginCollectionDocument<T> {
  readonly id: string;
  readonly parentId?: string;
  readonly document: T;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PluginCollectionPage<T> {
  readonly items: PluginCollectionDocument<T>[];
  readonly nextCursor: string | null;
}

export interface PluginCollectionListOptions {
  readonly limit?: number;
  readonly cursor?: string;
}

export interface PluginCollectionPutOptions {
  /** Required when the collection is bound to an entity in plugin.json. */
  readonly parentId?: string;
}

export interface PluginCollection<T> {
  list(options?: PluginCollectionListOptions): Promise<PluginCollectionPage<T>>;
  get(id: string): Promise<PluginCollectionDocument<T> | null>;
  put(
    id: string,
    document: T,
    options?: PluginCollectionPutOptions
  ): Promise<PluginCollectionDocument<T>>;
  delete(id: string): Promise<void>;
}

type CollectionRequester = Pick<OWOXApiClient, 'getJson' | 'putJson' | 'deleteJson'>;

function safePathSegment(value: string, label: string): string {
  if (value === '.' || value === '..') {
    throw new TypeError(`${label} cannot be "." or ".."`);
  }
  return encodeURIComponent(value);
}

/** @internal Creates a collection facade over the host-owned API transport. */
export function createPluginCollection<T>(
  requester: CollectionRequester,
  collectionName: string
): PluginCollection<T> {
  const documentsPath = `${COLLECTIONS_API_PATH}/${safePathSegment(collectionName, 'collectionName')}/documents`;
  const documentPath = (id: string) => `${documentsPath}/${safePathSegment(id, 'document id')}`;

  return {
    list: (options = {}) => {
      const query: Record<string, string> = {};
      if (options.limit !== undefined) {
        query.limit = String(options.limit);
      }
      if (options.cursor !== undefined) {
        query.cursor = options.cursor;
      }

      return requester.getJson<PluginCollectionPage<T>>(documentsPath, query);
    },

    async get(id: string) {
      try {
        return await requester.getJson<PluginCollectionDocument<T>>(documentPath(id));
      } catch (error) {
        if (error instanceof PluginTransportError && error.payload.status === 404) {
          return null;
        }
        throw error;
      }
    },

    put: (id, document, options = {}) =>
      requester.putJson<PluginCollectionDocument<T>>(documentPath(id), {
        document,
        ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
      }),

    async delete(id: string) {
      await requester.deleteJson(documentPath(id));
    },
  };
}
