export interface ManifestParameter {
  requiredType: 'string' | 'number' | 'boolean' | 'date';
  isRequired: boolean;
  default?: unknown;
  label?: string;
  /** Help text shown to whoever configures the connector. Maps to the spec's `description`. */
  description?: string;
  attributes?: string[];
}

export interface ManifestField {
  type: string;
  description?: string;
  dataPath?: string;
}

export interface ManifestNodeRequest {
  method: 'GET' | 'POST';
  path: string;
  queryParameters?: Record<string, string>;
  body?: Record<string, unknown>;
}

export interface PaginationNone {
  type: 'none';
}
/**
 * The legacy `*Param` fields and `cursorPath` are optional on purpose: they are the
 * pre-`inject`/pre-`cursor` spellings, and the engine accepts either side of each pair
 * (`ManifestParser` demands an `inject` block *or* the legacy param name, and a `cursor`
 * block *or* the legacy `cursorPath`). A manifest written against the current grammar —
 * the one the MCP reference documents, and the one an AI assistant emits — carries only
 * the modern half, so anything reading these must treat them as possibly absent.
 */
export interface PaginationOffset {
  type: 'offset';
  offsetParam?: string;
  pageSize?: number;
  inject?: { into: 'query' | 'header' | 'body' | 'path'; name?: string; path?: string[] };
}
export interface PaginationPage {
  type: 'page';
  pageParam?: string;
  startPage?: number;
  inject?: { into: 'query' | 'header' | 'body' | 'path'; name?: string; path?: string[] };
}
export interface PaginationCursor {
  type: 'cursor';
  cursorPath?: string[];
  cursorParam?: string;
  cursor?: { from: 'body' | 'header'; path?: string[]; header?: string; linkRel?: string };
  inject?: { into: 'query' | 'header' | 'body' | 'path'; name?: string; path?: string[] };
  stopCondition?: { path?: string[]; equals?: string | number | boolean };
}
export type ManifestNodePagination =
  | PaginationNone
  | PaginationOffset
  | PaginationPage
  | PaginationCursor;

export function createDefaultPagination(
  type: ManifestNodePagination['type']
): ManifestNodePagination {
  switch (type) {
    case 'none':
      return { type: 'none' };
    case 'offset':
      return { type: 'offset', offsetParam: 'offset', pageSize: 100 };
    case 'page':
      return { type: 'page', pageParam: 'page', startPage: 1 };
    case 'cursor':
      return { type: 'cursor', cursorPath: ['next'], cursorParam: 'cursor' };
  }
}

export interface IncrementalRequest {
  into: 'query' | 'body';
  startName?: string;
  endName?: string;
  startPath?: string[];
  endPath?: string[];
  format?: string;
}
export interface IncrementalNone {
  strategy: 'none';
}
// There is deliberately no `cursorField` here. The key appears in older manifests and once
// had an input in the builder, but nothing in the engine (`packages/connectors/src`) reads
// it — the date window is driven entirely by `request`. An existing one is inert and is
// carried through untouched (see IncrementalEditor); the builder just stops authoring new ones.
export interface IncrementalDayByDay {
  strategy: 'day-by-day';
  request: IncrementalRequest;
}
export interface IncrementalRange {
  strategy: 'range';
  request: IncrementalRequest;
}
export type ManifestNodeIncremental = IncrementalNone | IncrementalDayByDay | IncrementalRange;

export function createDefaultIncremental(
  strategy: ManifestNodeIncremental['strategy']
): ManifestNodeIncremental {
  switch (strategy) {
    case 'none':
      return { strategy: 'none' };
    case 'day-by-day':
      return {
        strategy: 'day-by-day',
        request: { into: 'query', startName: 'date', format: 'YYYY-MM-DD' },
      };
    case 'range':
      return {
        strategy: 'range',
        request: {
          into: 'query',
          startName: 'start_date',
          endName: 'end_date',
          format: 'YYYY-MM-DD',
        },
      };
  }
}

export interface AddTransform {
  type: 'add';
  field: string;
  value: string;
}
export interface RemoveTransform {
  type: 'remove';
  field: string;
}
export interface KeysToLowerTransform {
  type: 'keysToLower';
}
export interface FlattenTransform {
  type: 'flatten';
  separator?: string;
}
export type Transform = AddTransform | RemoveTransform | KeysToLowerTransform | FlattenTransform;

export function createDefaultTransform(type: Transform['type']): Transform {
  switch (type) {
    case 'add':
      return { type: 'add', field: '', value: '' };
    case 'remove':
      return { type: 'remove', field: '' };
    case 'keysToLower':
      return { type: 'keysToLower' };
    case 'flatten':
      return { type: 'flatten', separator: '_' };
  }
}

export type ErrorAction = 'RETRY' | 'IGNORE' | 'FAIL';
export interface BodyMatch {
  path: string[];
  equals?: string;
  contains?: string;
}
export type ErrorBackoff =
  | { type: 'constant'; delayMs: number }
  | { type: 'exponential'; factor?: number; baseMs?: number }
  | { type: 'waitTimeFromHeader'; header?: string }
  | { type: 'waitUntilTimeFromHeader'; header: string; regex?: string; minMs?: number };
export interface ResponseFilter {
  httpCodes?: number[];
  messageContains?: string;
  bodyMatch?: BodyMatch;
  action: ErrorAction;
  backoff?: ErrorBackoff;
}
export interface NodeErrorHandler {
  responseFilters: ResponseFilter[];
  backoff?: ErrorBackoff;
}

export function createDefaultErrorHandler(): NodeErrorHandler {
  return { responseFilters: [] };
}
export function createDefaultResponseFilter(): ResponseFilter {
  return { httpCodes: [], action: 'RETRY' };
}

export type ResponseFormat = 'json' | 'csv' | 'jsonl';

export type PartitionRouter =
  | {
      type: 'substream';
      parent: {
        request: ManifestNodeRequest;
        recordPath: string[];
        key: string;
        pagination?: ManifestNodePagination;
      };
      partitionField: string;
    }
  | { type: 'list'; values?: string[]; valuesFromParameter?: string; partitionField: string };

export function createDefaultPartitionRouter(): PartitionRouter {
  return {
    type: 'substream',
    parent: { request: { method: 'GET', path: '' }, recordPath: [], key: '' },
    partitionField: '',
  };
}
export function createDefaultListPartitionRouter(): PartitionRouter {
  return { type: 'list', partitionField: '' };
}

export type RecordFilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'isNotNull'
  | 'isNull'
  | 'inList';
export interface RecordFilter {
  path: string[];
  operator: RecordFilterOperator;
  value?: string;
  valuesFromParameter?: string;
}

export interface AsyncSubmit {
  method: 'GET' | 'POST';
  path: string;
  queryParameters?: Record<string, string>;
  body?: Record<string, unknown>;
  jobIdPath: string[];
}
export interface AsyncPoll {
  method: 'GET' | 'POST';
  path: string;
  queryParameters?: Record<string, string>;
  statusPath: string[];
  readyValue: string;
  failedValue?: string;
  resultUrlPath: string[];
  backoff?: { maxAttempts?: number; initialMs?: number; maxMs?: number };
}
export interface AsyncDownload {
  recordPath: string[];
}
export interface ManifestAsyncRetriever {
  type: 'async';
  submit: AsyncSubmit;
  poll: AsyncPoll;
  download: AsyncDownload;
}

export function createDefaultAsyncRetriever(): ManifestAsyncRetriever {
  return {
    type: 'async',
    submit: { method: 'GET', path: '', jobIdPath: [] },
    poll: {
      method: 'GET',
      path: '',
      statusPath: [],
      readyValue: '',
      resultUrlPath: [],
      backoff: { maxAttempts: 180, initialMs: 3000, maxMs: 15000 },
    },
    download: { recordPath: [] },
  };
}

export interface ManifestNode {
  request: ManifestNodeRequest;
  recordSelector: { recordPath: string[]; responseFormat?: ResponseFormat };
  fields: Record<string, ManifestField>;
  uniqueKeys?: string[];
  defaultFields?: string[];
  destinationName?: string;
  isTimeSeries?: boolean;
  overview?: string;
  pagination?: ManifestNodePagination;
  incremental?: ManifestNodeIncremental;
  transformations?: Transform[];
  errorHandler?: NodeErrorHandler;
  partitionRouter?: PartitionRouter;
  recordFilter?: RecordFilter;
  retriever?: ManifestAsyncRetriever;
}

export function createEmptyNode(): ManifestNode {
  return { request: { method: 'GET', path: '' }, recordSelector: { recordPath: [] }, fields: {} };
}

export type AuthInto = 'header' | 'query';
export interface AuthInject {
  into: AuthInto;
  name: string;
  format: string;
}
export interface ApiKeyAuth {
  type: 'apiKey';
  inject: AuthInject;
}
export interface BasicAuth {
  type: 'basic';
  username: string;
  password?: string;
}
export interface BearerAuth {
  type: 'bearer';
  tokenUrl?: string;
  inject: AuthInject;
}
export interface TokenExchangeSpec {
  url: string;
  method?: string;
  body: Record<string, unknown>;
  tokenPath: string[];
  ttlSeconds?: number;
}
export interface TokenExchangeAuth {
  type: 'tokenExchange';
  exchange: TokenExchangeSpec;
  inject: AuthInject;
}
export interface OAuth2Authentication {
  type: 'oauth2';
  tokenUrl: string;
  grantType?: 'refresh_token' | 'client_credentials';
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  scope?: string;
  /**
   * Fallback cache TTL (seconds) used only when the token response has no
   * usable `expires_in`. Optional — the engine falls back to a 300s default
   * when this is also unset.
   */
  ttlSeconds?: number;
  inject: AuthInject;
}
export type BranchAuthentication =
  | ApiKeyAuth
  | BearerAuth
  | TokenExchangeAuth
  | BasicAuth
  | OAuth2Authentication;
export interface SelectiveAuthentication {
  type: 'selective';
  selectionParameter: string;
  authenticators: Record<string, BranchAuthentication>;
}
export type BuilderAuthentication =
  | ApiKeyAuth
  | BearerAuth
  | TokenExchangeAuth
  | BasicAuth
  | OAuth2Authentication
  | SelectiveAuthentication;

export function createDefaultSelectiveAuthentication(): SelectiveAuthentication {
  return { type: 'selective', selectionParameter: '', authenticators: {} };
}

export function createDefaultAuthentication(
  type: BuilderAuthentication['type']
): BuilderAuthentication {
  switch (type) {
    case 'apiKey':
      return {
        type: 'apiKey',
        inject: { into: 'query', name: 'api_key', format: '{{ parameters.ApiKey }}' },
      };
    case 'basic':
      return { type: 'basic', username: '', password: '' };
    case 'bearer':
      return {
        type: 'bearer',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ parameters.Token }}' },
      };
    case 'tokenExchange':
      return {
        type: 'tokenExchange',
        exchange: { url: '', method: 'POST', body: {}, tokenPath: ['token'], ttlSeconds: 3600 },
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      };
    case 'oauth2':
      return {
        type: 'oauth2',
        tokenUrl: '',
        grantType: 'refresh_token',
        clientId: '',
        clientSecret: '',
        refreshToken: '',
        inject: { into: 'header', name: 'Authorization', format: 'Bearer {{ auth.token }}' },
      };
    case 'selective':
      return createDefaultSelectiveAuthentication();
  }
}

export interface ManifestAccounts {
  from: string;
  parse?: { split?: string; trim?: boolean; strip?: string; prefix?: string };
}

export interface BuilderManifest {
  version: string;
  name: string;
  title?: string;
  baseUrl: string;
  description?: string;
  docUrl?: string;
  parameters: Record<string, ManifestParameter>;
  nodes: Record<string, ManifestNode>;
  authentication?: BuilderAuthentication;
  accounts?: ManifestAccounts;
  rateLimit?: { requests: number; perSeconds: number };
}

export function createEmptyManifest(): BuilderManifest {
  return { version: '1.0', name: '', baseUrl: '', parameters: {}, nodes: {} };
}

export function createDefaultAccounts(): ManifestAccounts {
  return { from: '' };
}
