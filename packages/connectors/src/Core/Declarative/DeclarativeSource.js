/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { AbstractSource } from '../AbstractSource.js';
import { TemplateEngine } from './TemplateEngine.js';
import { SsrfGuard } from './SsrfGuard.js';
import { Authenticator } from './Authenticator.js';
import { Requester } from './Requester.js';
import { FieldCaster } from './FieldCaster.js';
import { formatCursorDate } from './dateFormat.js';
import { Transformer } from './Transformer.js';
import { ErrorHandler } from './ErrorHandler.js';
import { AccountResolver } from './AccountResolver.js';
import { RetrieverFactory } from './RetrieverFactory.js';
import { createRateLimiter } from './rateLimiter.js';
import { RecordFilter } from './RecordFilter.js';
import { setPathSafe } from './pathUtils.js';
import { isTimeSeriesManifestNode, nodeDateStrategy } from './timeSeries.js';
import { PARAMETER_OWNER, DATE_STRATEGY } from '../../Constants/CommonConstants.js';
import { SampleEvent } from '../Events/SampleEvent.js';
import {
  GENERATED_REFRESH_TOKEN_CONFIG_FIELD,
  GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD,
} from '../../Constants/CredentialConstants.js';

// Canonical storage-layer field types (UPPERCASE DATA_TYPES). Declared locally
// because the DATA_TYPES constant (Constants/DataTypes.js) is a bundle-global with
// no ES export, and this module is unit-tested in isolation.
const STORAGE_FIELD_TYPES = new Set([
  'STRING',
  'BOOLEAN',
  'INTEGER',
  'NUMBER',
  'DATE',
  'DATETIME',
  'TIME',
  'TIMESTAMP',
  'ARRAY',
  'OBJECT',
]);

/**
 * Normalizes a manifest field type to the canonical UPPERCASE vocabulary the
 * storage layer expects. Manifest fields are authored in lowercase (JSON-schema
 * style, e.g. "integer") via the no-code builder, but the storage `_convertTypeToStorageType`
 * switches on UPPERCASE DATA_TYPES and throws on anything else. Bundled sources
 * already emit uppercase. Unknown/missing types fall back to STRING so a
 * hand-authored manifest never crashes a run mid-flight.
 * @param {unknown} type
 * @returns {string}
 */
function toStorageFieldType(type) {
  if (!type) return 'STRING';
  const upper = String(type).toUpperCase();
  return STORAGE_FIELD_TYPES.has(upper) ? upper : 'STRING';
}

/**
 * A connector defined entirely by a declarative manifest. Implements the
 * AbstractSource hook contract by compiling the manifest; AbstractConnector
 * orchestrates it like any other Source.
 */
export class DeclarativeSource extends AbstractSource {
  /**
   * @param {import('../AbstractContext.js').AbstractContext} context
   * @param {object} model - ManifestModel from ManifestParser
   * @param {object} [options={}] - optional run limits
   * @param {number} [options.maxPages] - cap page count (e.g. for live-test runs)
   * @param {number} [options.maxRows]  - cap row count (e.g. for live-test runs)
   */
  constructor(context, model, options = {}) {
    super(context);
    this.model = model;
    this.templateEngine = new TemplateEngine();
    this.ssrfGuard = new SsrfGuard(model.allowedHosts);
    this.rateLimiter = createRateLimiter(model.rateLimit);

    this.parameters = model.parameters || {};
    context.registerParameters(this.parameters, PARAMETER_OWNER.SOURCE);

    this.fieldsSchema = this._compileNodes(model.nodes);
    this.runLimits = {
      maxPages: options.maxPages,
      maxRows: options.maxRows,
      maxSlices: options.maxSlices,
    };
    this.emitSample = Boolean(options.emitSample);
    this.sampleSize = options.sampleSize ?? 3;
    this._sampleEmitted = false;
    this._activeErrorHandler = null;
    this._pendingBackoff = null;
  }

  _compileNodes(nodes = {}) {
    const schema = {};
    for (const [name, node] of Object.entries(nodes)) {
      schema[name] = {
        fields: this._normalizeFieldTypes(node.fields || {}),
        uniqueKeys: node.uniqueKeys || [],
        defaultFields: node.defaultFields || Object.keys(node.fields || {}),
        destinationName: node.destinationName || name,
        // Inferred, not just copied: a node that declares an `incremental`
        // strategy is time-series whether or not it also spells out
        // `isTimeSeries` (see timeSeries.js for why both spellings had to be
        // accepted). ManifestParser gates the StartDate/EndDate backfill
        // parameters on the same predicate so the two cannot disagree.
        isTimeSeries: isTimeSeriesManifestNode(node),
        // Opts the node into AbstractConnector's full-refresh mode: the snapshot
        // replaces the destination table outright, so rows removed upstream are
        // removed downstream too. Without this a manifest could not express what
        // the bundled Google Sheets source does.
        isFullRefresh: Boolean(node.isFullRefresh),
        overview: node.overview || '',
      };
    }
    return schema;
  }

  /**
   * Returns a copy of the node's fields with each `type` normalized to the
   * canonical storage vocabulary (UPPERCASE). New objects are returned so the raw
   * manifest (`this.model.nodes`) keeps its authored lowercase types — FieldCaster
   * reads those directly and switches on the lowercase vocabulary.
   */
  _normalizeFieldTypes(fields) {
    const out = {};
    for (const [fieldName, def] of Object.entries(fields)) {
      out[fieldName] = { ...(def || {}), type: toStorageFieldType(def?.type) };
    }
    return out;
  }

  // --- hooks ---

  getAccounts(context) {
    const accountsConfig = this.model.accounts || null;
    const resolver = new AccountResolver(accountsConfig, () =>
      accountsConfig ? this.templateEngine.render(accountsConfig.from, this._baseScope()) : ''
    );
    return resolver.resolve();
  }

  getDateStrategy(nodeName) {
    return nodeDateStrategy(this.model.nodes[nodeName]);
  }

  async fetchData({ nodeName, fields, accountId, startDate, endDate }) {
    const node = this.model.nodes[nodeName];
    if (!node) throw new Error(`DeclarativeSource: unknown node "${nodeName}"`);

    const scope = this._scope({ accountId, startDate, endDate, fields });

    // Inject the date window: into the submit body for async, into the request
    // (query) for sync.
    let nodeForRetriever = node;
    if (node.retriever?.type === 'async') {
      const submit = this._withDateWindow(
        node.retriever.submit,
        node.incremental,
        startDate,
        endDate
      );
      nodeForRetriever = { ...node, retriever: { ...node.retriever, submit } };
    } else {
      const requestSpec = this._withDateWindow(node.request, node.incremental, startDate, endDate);
      nodeForRetriever = { ...node, request: requestSpec };
    }

    // Per-node error policy. _activeErrorHandler / _pendingBackoff are
    // instance fields read later by the isValidToRetry / calculateBackoff
    // overrides. This is race-free ONLY because AbstractConnector.run processes
    // nodes strictly sequentially (one awaited fetchData per source instance at
    // a time) — do not introduce concurrent fetchData on the same instance.
    const isSync = node.retriever?.type !== 'async';
    this._activeErrorHandler =
      isSync && node.errorHandler ? new ErrorHandler(node.errorHandler) : null;
    this._pendingBackoff = null;

    const auth = new Authenticator(
      this.model.authentication || null,
      this.templateEngine,
      this.ssrfGuard,
      {
        // The Authenticator stays context-free: it reports a provider-rotated
        // refresh token here. A fresh Authenticator is constructed on every
        // fetchData call (this line runs per-node), so the token must ALSO be
        // written into the run's GeneratedRefreshToken context parameter — not
        // just forwarded to the host — or a later node in this same run would
        // rebuild its scope from the still-stale manifest-configured value (see
        // _setGeneratedRefreshToken / _baseScope).
        onCredentialsUpdate: credentials => {
          const rotated = credentials?.[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];
          if (rotated) this._setGeneratedRefreshToken(rotated);
          this.context.updateCredentials(credentials);
        },
      }
    );
    const requester = new Requester({
      baseUrl: this.model.baseUrl,
      httpClient: this,
      auth,
      ssrfGuard: this.ssrfGuard,
      templateEngine: this.templateEngine,
      responseFormat: node.recordSelector?.responseFormat,
      rateLimiter: this.rateLimiter,
      // Only so an errorHandler IGNORE that discards a response can say WHICH
      // node and path it discarded (see Requester._reportIgnored).
      context: this.context,
      nodeName,
    });
    const retriever = RetrieverFactory.build(
      nodeForRetriever,
      {
        requester,
        httpClient: this,
        ssrfGuard: this.ssrfGuard,
        context: this.context,
      },
      this.runLimits
    );

    const rawRecords = await retriever.run(scope);
    if (rawRecords.length > 0) {
      const nodeTag = this.context.getParameter('DestinationTableName')?.value ?? nodeName;
      this.context.emitAnalytics('rows_extracted', rawRecords.length, { node: nodeTag });
    }
    const recordFilter = node.recordFilter ? new RecordFilter(node.recordFilter) : null;
    const filtered = recordFilter
      ? rawRecords.filter(r => recordFilter.keep(r, scope))
      : rawRecords;
    const records = new Transformer(node.transformations || [], this.templateEngine).transform(
      filtered,
      scope
    );
    if (this.emitSample && !this._sampleEmitted) {
      this._sampleEmitted = true;
      this.context.emit(new SampleEvent(records.slice(0, this.sampleSize)));
    }
    return new FieldCaster(node.fields || {}).cast(records);
  }

  /**
   * Stash a freshly rotated refresh token on the run's GeneratedRefreshToken
   * parameter so a later node's scope (rebuilt from context on every fetchData
   * call — see _baseScope) reads the live value instead of the one baked into
   * the manifest. Mirrors MicrosoftAds/Source.js's _setGeneratedRefreshToken.
   * @param {string} refreshToken
   */
  _setGeneratedRefreshToken(refreshToken) {
    const existing = this.context.getParameter(GENERATED_REFRESH_TOKEN_CONFIG_FIELD);
    if (existing && typeof existing === 'object') {
      existing.value = refreshToken;
      return;
    }
    this.context.sourceConfig[GENERATED_REFRESH_TOKEN_CONFIG_FIELD] = { value: refreshToken };
  }

  async isValidToRetry(error) {
    const handler = this._activeErrorHandler;
    if (!handler) {
      this._pendingBackoff = null;
      error._declAction = null;
      return this._defaultRetryable(error);
    }
    let bodyText = '';
    let bodyJson = null;
    if (handler.needsBody()) {
      bodyText = await this._readErrorBody(error);
      try {
        bodyJson = JSON.parse(bodyText);
      } catch {
        bodyJson = null;
      }
    }
    const matched = handler.match(error.statusCode, bodyText, bodyJson);
    error._declAction = matched ? matched.action : null;
    const retry = matched ? matched.action === 'RETRY' : this._defaultRetryable(error);
    this._pendingBackoff = retry ? { filter: matched, response: error.response } : null;
    return retry;
  }

  calculateBackoff(attempt, initialDelay) {
    if (this._pendingBackoff && this._activeErrorHandler) {
      const { filter, response } = this._pendingBackoff;
      this._pendingBackoff = null;
      const ms = this._activeErrorHandler.delayMs(filter, response, attempt, initialDelay);
      if (ms != null) return ms;
    }
    return super.calculateBackoff(attempt, initialDelay);
  }

  _defaultRetryable(error) {
    if (error.statusCode && error.statusCode >= 500) return true;
    if (error.statusCode === 429) return true;
    if (!error.statusCode) return true;
    return false;
  }

  /**
   * The error-response body text the errorHandler filters match against.
   *
   * Reads `error.responseBody` FIRST. AbstractSource.urlFetchWithRetry has
   * already consumed the body on this very error (it embeds a snippet in the
   * message) and attached the full text there, and a fetch Response body is
   * single-shot: calling `.text()` a second time rejects with "Body is
   * unusable". The `.catch(() => '')` below then turned that into an empty
   * string and the memo froze it, so against a real Response EVERY
   * `messageContains` / `bodyMatch` filter saw '' and never matched — every
   * IGNORE/RETRY/FAIL rule an author wrote was inert, silently. Test doubles
   * that re-serve `.text()` on demand hid it, which is why the suite was green.
   *
   * The `.text()` branch is kept for an error that reaches here without the
   * fetch path having captured a body (a caller that threw its own error object).
   */
  _readErrorBody(error) {
    if (error._declBodyText !== undefined) return Promise.resolve(error._declBodyText);
    if (typeof error.responseBody === 'string') {
      error._declBodyText = error.responseBody;
      return Promise.resolve(error._declBodyText);
    }
    const resp = error.response;
    return Promise.resolve()
      .then(() => (resp && typeof resp.text === 'function' ? resp.text() : ''))
      .catch(() => '')
      .then(t => (error._declBodyText = t ?? ''));
  }

  // --- scope helpers ---

  _baseScope() {
    const parameters = {};
    for (const [name] of Object.entries(this.parameters)) {
      const p = this.context.getParameter(name);
      if (p) parameters[name] = p.value;
    }
    return { parameters };
  }

  _scope({ accountId, startDate, endDate, fields }) {
    return {
      ...this._baseScope(),
      account: { id: accountId },
      dateWindow: { start: startDate, end: endDate },
      node: { selectedFields: Array.isArray(fields) ? fields.join(',') : '' },
    };
  }

  /**
   * Returns a copy of the request/submit spec with the date window injected.
   * incremental.request.into === 'query' adds startName/endName query params;
   * === 'body' sets startPath/endPath into a cloned body object.
   */
  _withDateWindow(spec, incremental, startDate, endDate) {
    if (!spec || !incremental || incremental.strategy === DATE_STRATEGY.NONE) return spec;
    const inj = incremental.request;
    if (!inj) return spec;

    if (inj.into === 'query') {
      const query = { ...(spec.queryParameters || {}) };
      if (inj.startName && startDate)
        query[inj.startName] = formatCursorDate(startDate, inj.format);
      if (inj.endName && endDate) query[inj.endName] = formatCursorDate(endDate, inj.format);
      return { ...spec, queryParameters: query };
    }

    if (inj.into === 'body') {
      const body = JSON.parse(JSON.stringify(spec.body || {}));
      if (inj.startPath && startDate)
        this._setPath(body, inj.startPath, formatCursorDate(startDate, inj.format));
      if (inj.endPath && endDate)
        this._setPath(body, inj.endPath, formatCursorDate(endDate, inj.format));
      return { ...spec, body };
    }

    return spec;
  }

  /**
   * In-place deep-set into the already-cloned date-window body (see
   * _withDateWindow, which clones before calling this), so unlike the
   * Paginator's variant it does not clone or return, and it accepts whatever
   * path shape the manifest declared. Shares the unsafe-segment guard.
   */
  _setPath(obj, path, value) {
    setPathSafe(obj, path, value, '_setPath');
  }
}
