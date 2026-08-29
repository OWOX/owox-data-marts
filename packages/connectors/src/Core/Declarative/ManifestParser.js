/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { GENERATED_REFRESH_TOKEN_CONFIG_FIELD } from '../../Constants/CredentialConstants.js';
import { CONFIG_ATTRIBUTES } from '../../Constants/CommonConstants.js';
import { TemplateEngine } from './TemplateEngine.js';
import { assertSafePathSegments } from './pathUtils.js';
import { declaresDateWindow, isTimeSeriesManifestNode } from './timeSeries.js';

/**
 * Parses + validates a connector manifest (JSON string) into a plain
 * ManifestModel object. Validation is strict: required keys must be present and
 * only known component types are accepted.
 */
const SUPPORTED_AUTH_TYPES = new Set([
  'apiKey',
  'bearer',
  'tokenExchange',
  'basic',
  'selective',
  'oauth2',
]);
const OAUTH2_GRANT_TYPES = new Set(['refresh_token', 'client_credentials']);
const TRANSFORM_TYPES = new Set(['add', 'remove', 'keysToLower', 'flatten']);
const ERROR_ACTIONS = new Set(['RETRY', 'IGNORE', 'FAIL']);
const BACKOFF_TYPES = new Set([
  'constant',
  'exponential',
  'waitTimeFromHeader',
  'waitUntilTimeFromHeader',
]);
const RECORD_FILTER_OPERATORS = new Set([
  'equals',
  'notEquals',
  'contains',
  'isNotNull',
  'isNull',
  'inList',
]);
const DATE_STRATEGIES = new Set(['day-by-day', 'range', 'none']);
const PAGINATION_TYPES = new Set(['none', 'offset', 'page', 'cursor']);
const INJECT_TARGETS = new Set(['query', 'header', 'body', 'path']);
const RESPONSE_FORMATS = new Set(['json', 'csv', 'jsonl']);

// The pre-`inject` spelling of the query parameter each pagination type writes
// its value into (Paginator._legacyParam). Still honoured at run time, so still
// accepted here as the alternative to an `inject` block.
const LEGACY_INJECT_PARAM = {
  cursor: 'cursorParam',
  offset: 'offsetParam',
  page: 'pageParam',
};

// Keys of an authenticator object that carry configuration rather than credential
// material. Everything NOT listed here is swept for parameter references and marked
// SECRET, so a key added to the manifest format later is protected by default
// instead of silently exposed — the safe direction for a fail-open bug class.
//
//  - clientId: OAuth2 §2.2 calls it a public identifier, and the bundled connectors
//    (e.g. Sources/MicrosoftAds) mark ClientSecret/RefreshToken SECRET while leaving
//    ClientId readable. Marking it would also externalise it into the credentials
//    table, so the config form could no longer show which app is connected.
//  - username: Basic auth's secret is the password; the username identifies the
//    account and is the only thing left in the UI to tell two configs apart.
//  - scope / grantType / tokenUrl / ttlSeconds / type: protocol literals and endpoints.
//  - selectionParameter: names the parameter that CHOOSES a selective branch; its
//    value is an authenticator key, not a credential.
const NON_CREDENTIAL_AUTH_KEYS = new Set([
  'type',
  'clientId',
  'username',
  'scope',
  'grantType',
  'tokenUrl',
  'ttlSeconds',
  'selectionParameter',
]);
// Inside `exchange`: the endpoint, verb, response path and cache TTL describe the
// call. Everything else (notably `body`, which is what buys the token) is swept.
const NON_CREDENTIAL_EXCHANGE_KEYS = new Set(['url', 'method', 'tokenPath', 'ttlSeconds']);
// Inside `inject`: `into`/`name` are the header or query-parameter NAME; only
// `format` renders the credential value.
const CREDENTIAL_INJECT_KEY = 'format';

// A node request is NOT a credential position. It legitimately interpolates page sizes,
// dates, account ids, field lists and filters, so a parameter used there must NOT be
// auto-marked SECRET the way an `authentication` reference is: that would mask ordinary
// configuration in the UI and push it into the credentials table — a worse bug than the one
// this closes. What can be done safely is to notice the shape that is almost certainly a
// credential (`queryParameters: { api_key: '{{ parameters.ApiKey }}' }`, often with no
// `authentication` block at all) and REPORT it, leaving the decision with the author.
//
// Deliberately a narrow name test rather than anything clever: a false positive costs the
// author one glance at a publish-time warning, a false negative leaks a token.
const CREDENTIAL_NAME_PATTERN = /token|secret|key|password|credential|auth/i;

function validateBackoff(b, nodeName, where) {
  if (typeof b !== 'object' || b === null || !BACKOFF_TYPES.has(b.type)) {
    throw new Error(
      `ManifestParser: node "${nodeName}" ${where} backoff.type must be one of constant|exponential|waitTimeFromHeader|waitUntilTimeFromHeader`
    );
  }
  if (b.type === 'constant' && typeof b.delayMs !== 'number') {
    throw new Error(
      `ManifestParser: node "${nodeName}" ${where} constant backoff requires a numeric delayMs`
    );
  }
  if (b.type === 'exponential') {
    if (b.factor !== undefined && typeof b.factor !== 'number')
      throw new Error(
        `ManifestParser: node "${nodeName}" ${where} exponential backoff factor must be a number`
      );
    if (b.baseMs !== undefined && typeof b.baseMs !== 'number')
      throw new Error(
        `ManifestParser: node "${nodeName}" ${where} exponential backoff baseMs must be a number`
      );
  }
  if (b.type === 'waitUntilTimeFromHeader') {
    if (typeof b.header !== 'string' || !b.header)
      throw new Error(
        `ManifestParser: node "${nodeName}" ${where} waitUntilTimeFromHeader requires a header`
      );
    if (b.regex !== undefined && typeof b.regex !== 'string')
      throw new Error(
        `ManifestParser: node "${nodeName}" ${where} waitUntilTimeFromHeader regex must be a string`
      );
    if (b.minMs !== undefined && typeof b.minMs !== 'number')
      throw new Error(
        `ManifestParser: node "${nodeName}" ${where} waitUntilTimeFromHeader minMs must be a number`
      );
  }
  if (b.type === 'waitTimeFromHeader') {
    if (b.header !== undefined && typeof b.header !== 'string') {
      throw new Error(
        `ManifestParser: node "${nodeName}" ${where} waitTimeFromHeader header must be a string`
      );
    }
  }
}

export class ManifestParser {
  /**
   * @param {string} json
   * @returns {object} ManifestModel
   */
  parse(json) {
    let raw;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      throw new Error(`ManifestParser: invalid JSON — ${e.message}`);
    }

    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('ManifestParser: manifest must be a JSON object');
    }

    for (const key of ['version', 'name', 'baseUrl', 'parameters', 'nodes']) {
      if (raw[key] === undefined) {
        throw new Error(`ManifestParser: missing required key "${key}"`);
      }
    }

    if (typeof raw.nodes !== 'object' || raw.nodes === null || Array.isArray(raw.nodes)) {
      throw new Error('ManifestParser: "nodes" must be a non-null object');
    }
    if (
      typeof raw.parameters !== 'object' ||
      raw.parameters === null ||
      Array.isArray(raw.parameters)
    ) {
      throw new Error('ManifestParser: "parameters" must be a non-null object');
    }

    // Shallow-copy so the auto-registered parameter below never mutates the
    // caller's raw manifest object.
    const parameters = { ...raw.parameters };

    // `DeclarativeSource` only exposes manifest-declared parameters to the
    // template scope (see `_baseScope`), so the host-injected rotated refresh
    // token needs a declaration to be readable. Register it for the author
    // instead of making every oauth2 manifest repeat it. Hidden + secret: it is
    // supplied by the host, never typed by a user.
    if (this._usesOAuth2(raw.authentication) && !parameters[GENERATED_REFRESH_TOKEN_CONFIG_FIELD]) {
      parameters[GENERATED_REFRESH_TOKEN_CONFIG_FIELD] = {
        isRequired: false,
        requiredType: 'string',
        attributes: [CONFIG_ATTRIBUTES.SECRET, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      };
    }

    // Standard advanced params — inject for every declarative connector so it
    // behaves like the bundled connectors. Guard `!parameters[NAME]` so an
    // author-declared value (builder or Code mode) always wins.
    if (!parameters.CreateEmptyTables) {
      parameters.CreateEmptyTables = {
        requiredType: 'boolean',
        default: true,
        label: 'Create Empty Tables',
        description: 'Create tables with all columns even if no data is returned from API',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      };
    }
    if (!parameters.ReimportLookbackWindow) {
      parameters.ReimportLookbackWindow = {
        requiredType: 'number',
        isRequired: true,
        default: 2,
        label: 'Reimport Lookback Window',
        description: 'Number of days to look back when reimporting data',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      };
    }
    // Manual-backfill dates — only when the connector has a time-series node
    // (AbstractConnector._getManualBackfillDateRange hardcodes these exact names).
    //
    // The gate MUST use the same predicate DeclarativeSource._compileNodes uses
    // to set `schema.isTimeSeries`, which is what AbstractConnector dispatches
    // on. When this asked `isTimeSeries === true` while the engine inferred
    // time-series from `incremental` as well, a builder-authored node was
    // walked day by day at run time but had no StartDate/EndDate to backfill
    // with — AbstractContext._validateRunConfig refuses a MANUAL_BACKFILL run
    // whose field was never registered, so the backfill failed outright. Hence
    // the shared isTimeSeriesManifestNode.
    const hasTimeSeriesNode = Object.values(raw.nodes).some(isTimeSeriesManifestNode);
    if (hasTimeSeriesNode) {
      if (!parameters.StartDate) {
        parameters.StartDate = {
          requiredType: 'date',
          label: 'Start Date',
          description: 'Start date for manual backfill',
          attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
        };
      }
      if (!parameters.EndDate) {
        parameters.EndDate = {
          requiredType: 'date',
          label: 'End Date',
          description: 'End date for manual backfill',
          attributes: [CONFIG_ATTRIBUTES.MANUAL_BACKFILL, CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
        };
      }
    }

    if (raw.authentication) {
      const t = raw.authentication.type;
      if (!SUPPORTED_AUTH_TYPES.has(t)) {
        throw new Error(`ManifestParser: authentication.type "${t}" not supported`);
      }
      if (t === 'oauth2') this._validateOAuth2(raw.authentication, 'authentication');
      if (t === 'selective') {
        const a = raw.authentication;
        if (typeof a.selectionParameter !== 'string' || !a.selectionParameter) {
          throw new Error(`ManifestParser: selective authentication requires a selectionParameter`);
        }
        if (
          typeof a.authenticators !== 'object' ||
          a.authenticators === null ||
          Array.isArray(a.authenticators) ||
          Object.keys(a.authenticators).length === 0
        ) {
          throw new Error(
            `ManifestParser: selective authentication requires a non-empty authenticators object`
          );
        }
        for (const [key, sub] of Object.entries(a.authenticators)) {
          if (
            typeof sub !== 'object' ||
            sub === null ||
            !SUPPORTED_AUTH_TYPES.has(sub.type) ||
            sub.type === 'selective'
          ) {
            throw new Error(
              `ManifestParser: selective authentication branch "${key}" has an unsupported type`
            );
          }
          if (sub.type === 'oauth2')
            this._validateOAuth2(sub, `authentication.authenticators.${key}`);
        }
      }
    }

    // Every downstream protection for a credential — externalising it out of
    // `data_mart.definition` into connector_source_credentials, masking it on the
    // viewer-readable GET, keeping it out of the search index — keys off the SECRET
    // attribute in the resolved specification. For a BUNDLED connector that attribute
    // comes from reviewed code; for a CUSTOM one it comes from user-authored JSON, so
    // an author who omits it leaks the token with no error and no warning. Mark the
    // parameters the manifest actually interpolates into authentication ourselves,
    // the same way GeneratedRefreshToken is registered above: auto-injection cannot
    // be forgotten, and unlike a publish-time refusal it breaks no existing connector.
    const { autoSecretAuthParameters, undeclaredAuthParameters } = this._applyAuthSecrets(
      raw.authentication,
      parameters
    );

    if (raw.rateLimit !== undefined) {
      const rl = raw.rateLimit;
      if (typeof rl !== 'object' || rl === null || Array.isArray(rl)) {
        throw new Error('ManifestParser: rateLimit must be an object');
      }
      if (!Number.isInteger(rl.requests) || rl.requests <= 0) {
        throw new Error('ManifestParser: rateLimit.requests must be a positive integer');
      }
      if (
        typeof rl.perSeconds !== 'number' ||
        !Number.isFinite(rl.perSeconds) ||
        rl.perSeconds <= 0
      ) {
        throw new Error('ManifestParser: rateLimit.perSeconds must be a positive number');
      }
    }

    const allowedHosts = this._collectHosts(raw);

    for (const [nodeName, node] of Object.entries(raw.nodes)) {
      if (!node.recordSelector && !(node.retriever?.type === 'async')) {
        throw new Error(`ManifestParser: node "${nodeName}" is missing "recordSelector"`);
      }
      if (
        node.recordSelector?.responseFormat !== undefined &&
        !RESPONSE_FORMATS.has(node.recordSelector.responseFormat)
      ) {
        throw new Error(
          `ManifestParser: node "${nodeName}" recordSelector.responseFormat "${node.recordSelector.responseFormat}" not supported`
        );
      }
      // Every recordPath is walked key-by-key by RecordSelector, whose constructor
      // does `Array.isArray(config.recordPath) ? config.recordPath : []`. A string
      // therefore does not fail — it silently becomes the EMPTY path, which selects
      // the whole response envelope as ONE record, so every declared field reads
      // null and every real row is lost with no error at all. The array form is what
      // the manifest reference documents for all three of these.
      //
      // The async job paths below are the same mixup with a different, more
      // expensive failure: they go to getPath, whose `for (const k of path)`
      // iterates a STRING one character at a time, so `"data.status"` reads
      // `body.d.a.t.a` and yields undefined. A dot-string `statusPath` then never
      // equals readyValue OR failedValue, and the poll loop runs its full
      // maxAttempts — 180 attempts at up to 15s apart is ~44 minutes holding a
      // concurrency slot — before failing with "job did not become ready", which
      // points at the upstream API rather than at the manifest. `jobIdPath` and
      // `resultUrlPath` fail faster but just as misleadingly ("job id not found").
      // The reference calls this dot-string-vs-array mixup a common, silent bug;
      // these were the only paths in the grammar not checked for it.
      //
      // Segments are deliberately not required to be strings: a positional index
      // into an array-shaped row (`[[ts, price], ...]`) is a legitimate segment.
      for (const [where, value] of [
        ['recordSelector.recordPath', node.recordSelector?.recordPath],
        ['retriever.download.recordPath', node.retriever?.download?.recordPath],
        ['partitionRouter.parent.recordPath', node.partitionRouter?.parent?.recordPath],
        ['retriever.submit.jobIdPath', node.retriever?.submit?.jobIdPath],
        ['retriever.poll.statusPath', node.retriever?.poll?.statusPath],
        ['retriever.poll.resultUrlPath', node.retriever?.poll?.resultUrlPath],
      ]) {
        if (value !== undefined && !Array.isArray(value)) {
          throw new Error(
            `ManifestParser: node "${nodeName}" ${where} must be an array of keys (e.g. ["data"]), not a ${typeof value}`
          );
        }
      }
      const strategy = node.incremental?.strategy ?? 'none';
      if (!DATE_STRATEGIES.has(strategy)) {
        throw new Error(
          `ManifestParser: node "${nodeName}" has unknown incremental.strategy "${strategy}"`
        );
      }
      // A missing `isTimeSeries` next to an `incremental` block is NOT refused:
      // isTimeSeriesManifestNode infers it, because declaring a date strategy is
      // already a declaration that the node is fetched by date. `isFullRefresh`
      // is the one pairing inference cannot resolve, so it stays an error.
      //
      // isFullRefresh WINS in the dispatch — _planNodes routes on
      // `!isFullRefresh && isTimeSeries` (AbstractConnector.js) — so the node
      // goes to processFullRefreshNode, which calls fetchData with
      // `startDate: null, endDate: null`, and _withDateWindow then injects
      // nothing. The incremental block is inert: the request goes out with no
      // date window, a `{{ dateWindow.start }}` field is written empty, and
      // uniqueKeys containing that date collapse every row onto one — none of
      // it visible at run time, because the run reports success.
      //
      // Unlike an omitted `isTimeSeries`, this cannot be filled in. Replacing
      // the destination table wholesale and walking it one window at a time are
      // opposite intents, both stated positively, and picking either one for the
      // author silently duplicates or truncates their data. Refuse it and let
      // them say which they meant.
      if (declaresDateWindow(node) && node.isFullRefresh) {
        throw new Error(
          `ManifestParser: node "${nodeName}" declares both "incremental" and "isFullRefresh", which are mutually exclusive — a full-refresh node replaces the whole table and is never given a date window, so the incremental block would be silently ignored. Remove "isFullRefresh" to fetch by date window, or remove the "incremental" block.`
        );
      }
      if (node.transformations !== undefined) {
        if (!Array.isArray(node.transformations)) {
          throw new Error(`ManifestParser: node "${nodeName}" transformations must be an array`);
        }
        for (const t of node.transformations) {
          if (!t || !TRANSFORM_TYPES.has(t.type)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" has an unknown transformation type "${t?.type}"`
            );
          }
          if (t.type === 'add' && (!t.field || t.value === undefined)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" "add" transformation requires field and value`
            );
          }
          if (t.type === 'remove' && !t.field) {
            throw new Error(
              `ManifestParser: node "${nodeName}" "remove" transformation requires field`
            );
          }
        }
      }
      if (node.errorHandler !== undefined) {
        const eh = node.errorHandler;
        if (typeof eh !== 'object' || eh === null || Array.isArray(eh)) {
          throw new Error(`ManifestParser: node "${nodeName}" errorHandler must be an object`);
        }
        if (eh.responseFilters !== undefined) {
          if (!Array.isArray(eh.responseFilters)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" errorHandler.responseFilters must be an array`
            );
          }
          for (const f of eh.responseFilters) {
            if (!f || typeof f !== 'object') {
              throw new Error(
                `ManifestParser: node "${nodeName}" errorHandler filter must be an object`
              );
            }
            const hasCodes = f.httpCodes !== undefined;
            if (
              hasCodes &&
              (!Array.isArray(f.httpCodes) || !f.httpCodes.every(c => typeof c === 'number'))
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" errorHandler filter httpCodes must be a numeric array`
              );
            }
            const hasMsg = f.messageContains !== undefined;
            if (hasMsg && typeof f.messageContains !== 'string') {
              throw new Error(
                `ManifestParser: node "${nodeName}" errorHandler filter messageContains must be a string`
              );
            }
            const hasBody = f.bodyMatch !== undefined;
            if (hasBody) {
              const bm = f.bodyMatch;
              if (
                typeof bm !== 'object' ||
                bm === null ||
                !Array.isArray(bm.path) ||
                bm.path.length === 0 ||
                !bm.path.every(p => typeof p === 'string')
              ) {
                throw new Error(
                  `ManifestParser: node "${nodeName}" errorHandler filter bodyMatch requires a non-empty string path`
                );
              }
              if (bm.equals === undefined && bm.contains === undefined) {
                throw new Error(
                  `ManifestParser: node "${nodeName}" errorHandler filter bodyMatch requires equals or contains`
                );
              }
              if (bm.equals !== undefined && typeof bm.equals !== 'string') {
                throw new Error(
                  `ManifestParser: node "${nodeName}" errorHandler filter bodyMatch.equals must be a string`
                );
              }
              if (bm.contains !== undefined && typeof bm.contains !== 'string') {
                throw new Error(
                  `ManifestParser: node "${nodeName}" errorHandler filter bodyMatch.contains must be a string`
                );
              }
            }
            const codesPresent = Array.isArray(f.httpCodes) && f.httpCodes.length > 0;
            if (!codesPresent && !hasMsg && !hasBody) {
              throw new Error(
                `ManifestParser: node "${nodeName}" errorHandler filter requires at least one of httpCodes, messageContains, bodyMatch`
              );
            }
            if (!ERROR_ACTIONS.has(f.action)) {
              throw new Error(
                `ManifestParser: node "${nodeName}" errorHandler filter has an invalid action "${f.action}"`
              );
            }
            if (f.backoff !== undefined) validateBackoff(f.backoff, nodeName, 'filter');
          }
        }
        if (eh.backoff !== undefined) validateBackoff(eh.backoff, nodeName, 'errorHandler');
        // Deliberately LAST, like the partitionRouter check below, so a handler that
        // is ALSO malformed keeps reporting the more specific message.
        //
        // errorHandler drives sync retrievers only: DeclarativeSource.fetchData builds
        // the ErrorHandler behind `retriever.type !== "async"`, so on an async node
        // every RETRY/IGNORE action and every waitTimeFromHeader backoff written here
        // is inert. That is invisible at run time in the worst way — a 429 on the poll
        // loop silently falls through to the engine's default retry policy, and an
        // IGNORE filter that was meant to tolerate a 404 fails the run instead.
        //
        // Refused rather than warned, for the same reason `partitionRouter` + async is
        // refused: this engine has no publish-time warning channel an author reliably
        // reads (run-time WARN is the run-FAILURE channel — see Requester._reportIgnored),
        // so a warning here would either fail the run or vanish. The grammar ships for
        // the first time in this release and no bundled manifest pairs the two, so
        // there is nothing to break. `poll.backoff` is the async equivalent.
        if (node.retriever?.type === 'async') {
          throw new Error(
            `ManifestParser: node "${nodeName}" errorHandler is not supported with an async retriever — an async node paces itself through "retriever.poll.backoff" instead, so these filters and this backoff would never run. Remove "errorHandler", or make the node sync.`
          );
        }
      }
      if (node.partitionRouter !== undefined) {
        const pr = node.partitionRouter;
        if (
          typeof pr !== 'object' ||
          pr === null ||
          (pr.type !== 'substream' && pr.type !== 'list')
        ) {
          throw new Error(
            `ManifestParser: node "${nodeName}" partitionRouter.type must be "substream" or "list"`
          );
        }
        if (!pr.partitionField || typeof pr.partitionField !== 'string') {
          throw new Error(
            `ManifestParser: node "${nodeName}" partitionRouter requires partitionField`
          );
        }
        if (pr.type === 'substream') {
          if (!pr.parent || typeof pr.parent.request !== 'object' || pr.parent.request === null) {
            throw new Error(
              `ManifestParser: node "${nodeName}" partitionRouter.parent requires a request object`
            );
          }
          if (!pr.parent.key) {
            throw new Error(
              `ManifestParser: node "${nodeName}" partitionRouter.parent requires a key`
            );
          }
        } else {
          const hasValues = pr.values !== undefined;
          const hasParam = pr.valuesFromParameter !== undefined;
          if (
            hasValues &&
            (!Array.isArray(pr.values) ||
              pr.values.length === 0 ||
              !pr.values.every(v => typeof v === 'string'))
          ) {
            throw new Error(
              `ManifestParser: node "${nodeName}" partitionRouter.values must be a non-empty array of strings`
            );
          }
          if (hasParam && (typeof pr.valuesFromParameter !== 'string' || !pr.valuesFromParameter)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" partitionRouter.valuesFromParameter must be a non-empty string`
            );
          }
          if (hasValues === hasParam) {
            throw new Error(
              `ManifestParser: node "${nodeName}" partitionRouter (list) requires exactly one of values or valuesFromParameter`
            );
          }
          if (pr.parent !== undefined) {
            throw new Error(
              `ManifestParser: node "${nodeName}" partitionRouter (list) must not have a parent`
            );
          }
        }
        if (node.retriever?.type === 'async') {
          throw new Error(
            `ManifestParser: node "${nodeName}" partitionRouter is not supported with an async retriever`
          );
        }
      }
      if (node.recordFilter !== undefined) {
        const rf = node.recordFilter;
        if (typeof rf !== 'object' || rf === null || Array.isArray(rf)) {
          throw new Error(`ManifestParser: node "${nodeName}" recordFilter must be an object`);
        }
        if (
          !Array.isArray(rf.path) ||
          rf.path.length === 0 ||
          !rf.path.every(p => typeof p === 'string')
        ) {
          throw new Error(
            `ManifestParser: node "${nodeName}" recordFilter requires a non-empty string path`
          );
        }
        if (!RECORD_FILTER_OPERATORS.has(rf.operator)) {
          throw new Error(
            `ManifestParser: node "${nodeName}" recordFilter operator "${rf.operator}" is not supported`
          );
        }
        if (
          (rf.operator === 'equals' || rf.operator === 'notEquals' || rf.operator === 'contains') &&
          typeof rf.value !== 'string'
        ) {
          throw new Error(
            `ManifestParser: node "${nodeName}" recordFilter "${rf.operator}" requires a string value`
          );
        }
        if (rf.operator === 'inList') {
          const hasValue = rf.value !== undefined;
          const hasParam = rf.valuesFromParameter !== undefined;
          if (hasValue && typeof rf.value !== 'string') {
            throw new Error(
              `ManifestParser: node "${nodeName}" recordFilter inList value must be a string`
            );
          }
          if (hasParam && (typeof rf.valuesFromParameter !== 'string' || !rf.valuesFromParameter)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" recordFilter inList valuesFromParameter must be a non-empty string`
            );
          }
          if (hasValue === hasParam) {
            throw new Error(
              `ManifestParser: node "${nodeName}" recordFilter inList requires exactly one of value or valuesFromParameter`
            );
          }
        }
      }
      const rType = node.retriever?.type ?? 'sync';
      if (rType === 'sync') {
        if (!node.request) {
          throw new Error(`ManifestParser: node "${nodeName}" is missing "request"`);
        }
        if (node.pagination) {
          const pg = node.pagination;
          const pType = pg.type ?? 'none';
          if (!PAGINATION_TYPES.has(pType)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" pagination.type "${pType}" not supported`
            );
          }
          if (pg.inject !== undefined) {
            const inj = pg.inject;
            if (typeof inj !== 'object' || inj === null || !INJECT_TARGETS.has(inj.into)) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.inject.into must be one of query|header|body|path`
              );
            }
            if (
              (inj.into === 'query' || inj.into === 'header') &&
              (typeof inj.name !== 'string' || !inj.name)
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.inject "${inj.into}" requires a name`
              );
            }
            if (inj.into === 'body') {
              if (
                !Array.isArray(inj.path) ||
                inj.path.length === 0 ||
                !inj.path.every(p => typeof p === 'string')
              ) {
                throw new Error(
                  `ManifestParser: node "${nodeName}" pagination.inject body requires a non-empty string path`
                );
              }
              // This path is deep-set with the CURSOR, i.e. a value the upstream
              // response chooses. Reject the prototype-pollution segments here so a
              // poisoned manifest fails at publish rather than mid-run.
              assertSafePathSegments(
                inj.path,
                `ManifestParser: node "${nodeName}" pagination.inject`
              );
            }
          }
          if (pg.cursor !== undefined) {
            const cur = pg.cursor;
            if (
              typeof cur !== 'object' ||
              cur === null ||
              (cur.from !== 'body' && cur.from !== 'header')
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.cursor.from must be "body" or "header"`
              );
            }
            if (
              cur.from === 'body' &&
              (!Array.isArray(cur.path) ||
                cur.path.length === 0 ||
                !cur.path.every(p => typeof p === 'string'))
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.cursor body requires a non-empty string path`
              );
            }
            if (cur.from === 'header' && (typeof cur.header !== 'string' || !cur.header)) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.cursor header requires a header name`
              );
            }
            if (cur.linkRel !== undefined && typeof cur.linkRel !== 'string') {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.cursor.linkRel must be a string`
              );
            }
          }
          if (pg.stopCondition !== undefined) {
            const sc = pg.stopCondition;
            if (
              typeof sc !== 'object' ||
              sc === null ||
              !Array.isArray(sc.path) ||
              sc.path.length === 0 ||
              !sc.path.every(p => typeof p === 'string')
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.stopCondition requires a non-empty string path`
              );
            }
            if (
              !(
                typeof sc.equals === 'string' ||
                typeof sc.equals === 'number' ||
                typeof sc.equals === 'boolean'
              )
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination.stopCondition.equals must be a string, number, or boolean`
              );
            }
          }

          // Completeness checks, deliberately LAST so that a manifest which is
          // also malformed in one of the shapes above keeps reporting that more
          // specific message.
          //
          // Each case below parses today and then fails SILENTLY at run time —
          // the node imports one page, or loops on the same page until maxPages,
          // and the run still reports success. A manifest that cannot paginate
          // correctly has to fail when it is published, not once a fraction of
          // the data is already in the destination table.
          if (pType === 'offset' && !(typeof pg.pageSize === 'number' && pg.pageSize > 0)) {
            throw new Error(
              `ManifestParser: node "${nodeName}" pagination type "offset" requires a positive numeric "pageSize" — the offset advances by it, so without it the engine stops after the first page and still reports success`
            );
          }
          if (pType === 'cursor') {
            const legacyPath = pg.cursorPath;
            if (pg.cursor === undefined && legacyPath === undefined) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination type "cursor" requires a "cursor" block (or the legacy "cursorPath") saying where the next cursor is read from — with neither, the engine reads the ENTIRE response body as the cursor, which is never empty, so paging never ends`
              );
            }
            if (
              legacyPath !== undefined &&
              (!Array.isArray(legacyPath) ||
                legacyPath.length === 0 ||
                !legacyPath.every(p => typeof p === 'string'))
            ) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination "cursorPath" must be a non-empty array of string keys`
              );
            }
          }
          if (pType !== 'none' && pg.inject === undefined) {
            const legacyName = LEGACY_INJECT_PARAM[pType];
            if (typeof pg[legacyName] !== 'string' || !pg[legacyName]) {
              throw new Error(
                `ManifestParser: node "${nodeName}" pagination type "${pType}" requires an "inject" block (or the legacy "${legacyName}") naming where the value is sent — with neither, the engine sends it as "?undefined=..."`
              );
            }
          }
        }
      } else if (rType === 'async') {
        const r = node.retriever;
        for (const part of ['submit', 'poll', 'download']) {
          if (!r[part]) {
            throw new Error(
              `ManifestParser: node "${nodeName}" async retriever requires "${part}"`
            );
          }
        }
      } else {
        throw new Error(
          `ManifestParser: node "${nodeName}" retriever.type "${rType}" not supported`
        );
      }
    }

    // The other half of the same hole: `authentication` is swept and marked above, but a
    // credential can also sit in a node request, which no pass may mark. Collect those and
    // let the host surface them, the same way undeclaredAuthParameters is surfaced. Runs
    // after _applyAuthSecrets so a parameter authentication already protects is not
    // reported a second time.
    const unprotectedRequestParameters = this._collectUnprotectedRequestParameters(
      raw.nodes,
      parameters
    );

    return {
      ...raw,
      parameters,
      allowedHosts,
      autoSecretAuthParameters,
      undeclaredAuthParameters,
      unprotectedRequestParameters,
    };
  }

  /**
   * Marks every declared parameter the manifest interpolates into a credential
   * position of `authentication` with CONFIG_ATTRIBUTES.SECRET.
   *
   * @param {object|undefined} auth - raw.authentication
   * @param {object} parameters - parameter map to mark (mutated: entries are REPLACED,
   *   never edited in place, because it is a shallow copy of the caller's manifest)
   * @returns {{autoSecretAuthParameters: string[], undeclaredAuthParameters: string[]}}
   *   what was marked, and credential references with no declaration to mark — the
   *   residue this pass cannot protect, which the host surfaces at publish time.
   */
  _applyAuthSecrets(auth, parameters) {
    const referenced = new Set();
    this._collectAuthParameterRefs(auth, referenced);

    const autoSecretAuthParameters = [];
    const undeclaredAuthParameters = [];
    for (const name of referenced) {
      const declared = parameters[name];
      if (!declared || typeof declared !== 'object') {
        // Nothing to hang the attribute on. This is also broken at run time —
        // DeclarativeSource._baseScope only exposes DECLARED parameters, so the
        // placeholder never resolves — but a selective branch nobody selects is
        // never rendered, so it can sit unnoticed. Report instead of throwing.
        undeclaredAuthParameters.push(name);
        continue;
      }
      const attributes = Array.isArray(declared.attributes) ? declared.attributes : [];
      if (attributes.includes(CONFIG_ATTRIBUTES.SECRET)) continue;
      parameters[name] = { ...declared, attributes: [...attributes, CONFIG_ATTRIBUTES.SECRET] };
      autoSecretAuthParameters.push(name);
    }
    return { autoSecretAuthParameters, undeclaredAuthParameters };
  }

  /**
   * Walks an authenticator, collecting the parameter names referenced from
   * credential-bearing positions. Recurses through `selective` branches.
   */
  _collectAuthParameterRefs(auth, into) {
    if (!auth || typeof auth !== 'object' || Array.isArray(auth)) return;

    for (const [key, value] of Object.entries(auth)) {
      if (NON_CREDENTIAL_AUTH_KEYS.has(key)) continue;

      if (key === 'authenticators') {
        // `selective`: each branch is a full authenticator with the same rules.
        if (value && typeof value === 'object') {
          for (const sub of Object.values(value)) this._collectAuthParameterRefs(sub, into);
        }
        continue;
      }

      if (key === 'inject') {
        if (value && typeof value === 'object') {
          this._collectParameterRefsDeep(value[CREDENTIAL_INJECT_KEY], into);
        }
        continue;
      }

      if (key === 'exchange') {
        if (value && typeof value === 'object') {
          for (const [exKey, exValue] of Object.entries(value)) {
            if (NON_CREDENTIAL_EXCHANGE_KEYS.has(exKey)) continue;
            this._collectParameterRefsDeep(exValue, into);
          }
        }
        continue;
      }

      // clientSecret, refreshToken, password, and any key the format grows later.
      this._collectParameterRefsDeep(value, into);
    }
  }

  _collectParameterRefsDeep(value, into) {
    if (typeof value === 'string') {
      this._collectParameterRefs(value, into);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) this._collectParameterRefsDeep(item, into);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) this._collectParameterRefsDeep(item, into);
    }
  }

  /**
   * Parameter names a template string interpolates: "Bearer {{ parameters.Token }}"
   * -> Token.
   *
   * Runs the real TemplateEngine against a recording scope rather than matching a
   * second placeholder regex here. The engine owns the placeholder grammar and the
   * allowed-scope list; a private copy of that grammar in the parser would drift
   * from it, and every drift is a credential this sweep silently fails to mark.
   */
  _collectParameterRefs(template, into) {
    if (!template.includes('{{')) return;
    const recorder = new Proxy(
      {},
      {
        get: (_target, key) => {
          if (typeof key === 'string') into.add(key);
          // A non-nullish value keeps render() from treating this as unresolved,
          // so the scan continues through the rest of the string.
          return '';
        },
      }
    );
    try {
      new TemplateEngine().render(template, { parameters: recorder }, { lenient: true });
    } catch {
      // A disallowed scope or unsafe path segment is an authoring error the parser
      // does not otherwise reject, and turning it into one here would refuse
      // manifests that publish today. References seen before the throw are kept.
    }
  }

  /**
   * Credential-looking parameters a node REQUEST interpolates without carrying
   * CONFIG_ATTRIBUTES.SECRET. Nothing here marks them — see CREDENTIAL_NAME_PATTERN for why
   * a node request cannot be treated as a credential position — so this is purely the
   * residue for the host to surface at publish time.
   *
   * @param {object} nodes - raw.nodes (already validated to be a non-null object)
   * @param {object} parameters - parameter map, AFTER _applyAuthSecrets has marked it
   * @returns {{parameter: string, usedIn: string[]}[]} one entry per parameter, listing every
   *   request position it appears in, so the warning can name the parameter AND where it is
   *   used. Sorted so the message is stable across publishes of the same manifest.
   */
  _collectUnprotectedRequestParameters(nodes, parameters) {
    const usedIn = new Map();
    for (const [nodeName, node] of Object.entries(nodes)) {
      for (const [label, spec] of this._requestSpecsOf(node)) {
        this._collectRequestParameterRefs(spec, `nodes.${nodeName}.${label}`, usedIn);
      }
    }

    const unprotected = [];
    for (const [name, locations] of usedIn) {
      if (!CREDENTIAL_NAME_PATTERN.test(name)) continue;
      const declared = parameters[name];
      // An undeclared reference carries no value to leak: DeclarativeSource._baseScope
      // exposes only DECLARED parameters, so the placeholder never renders. Warning about
      // it would be noise, and the auth sweep already reports the case that does matter.
      if (!declared || typeof declared !== 'object') continue;
      const attributes = Array.isArray(declared.attributes) ? declared.attributes : [];
      if (attributes.includes(CONFIG_ATTRIBUTES.SECRET)) continue;
      unprotected.push({ parameter: name, usedIn: [...locations].sort() });
    }
    return unprotected.sort((a, b) => a.parameter.localeCompare(b.parameter));
  }

  /**
   * The request-bearing subtrees of a node, labelled by their position in the manifest.
   *
   * Deliberately NOT the whole node: `fields`, `recordSelector`, `incremental` and
   * `transformations` describe the RESPONSE, and sweeping them would turn every field
   * named like a key into a warning the author cannot act on.
   */
  _requestSpecsOf(node) {
    if (!node || typeof node !== 'object') return [];
    const specs = [];
    if (node.request) specs.push(['request', node.request]);
    // An async retriever has no node.request: submit starts the job, and poll/download
    // carry headers of their own.
    for (const part of ['submit', 'poll', 'download']) {
      if (node.retriever?.[part]) specs.push([`retriever.${part}`, node.retriever[part]]);
    }
    if (node.partitionRouter?.parent?.request) {
      specs.push(['partitionRouter.parent.request', node.partitionRouter.parent.request]);
    }
    return specs;
  }

  /**
   * Records the parameter references of a request spec against the JSON path they sit at.
   *
   * Delegates the placeholder grammar to _collectParameterRefs rather than matching a
   * second regex: that recorder runs the real TemplateEngine, so what counts as a
   * reference here can never drift from what the engine actually interpolates.
   *
   * @param {unknown} value - a request spec, or any subtree of one
   * @param {string} path - JSON path of `value` within the manifest
   * @param {Map<string, Set<string>>} into - parameter name -> paths it is used at
   */
  _collectRequestParameterRefs(value, path, into) {
    if (typeof value === 'string') {
      const names = new Set();
      this._collectParameterRefs(value, names);
      for (const name of names) {
        if (!into.has(name)) into.set(name, new Set());
        into.get(name).add(path);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        this._collectRequestParameterRefs(item, `${path}[${index}]`, into)
      );
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        this._collectRequestParameterRefs(item, `${path}.${key}`, into);
      }
    }
  }

  _validateOAuth2(auth, label) {
    if (!auth.tokenUrl) {
      throw new Error(`ManifestParser: ${label} oauth2 requires "tokenUrl"`);
    }
    const grantType = auth.grantType ?? 'refresh_token';
    if (!OAUTH2_GRANT_TYPES.has(grantType)) {
      throw new Error(`ManifestParser: ${label} oauth2 grantType "${grantType}" not supported`);
    }
    if (!auth.clientId || !auth.clientSecret) {
      throw new Error(`ManifestParser: ${label} oauth2 requires "clientId" and "clientSecret"`);
    }
    if (grantType === 'refresh_token' && !auth.refreshToken) {
      throw new Error(
        `ManifestParser: ${label} oauth2 with grantType "refresh_token" requires "refreshToken"`
      );
    }
    if (
      auth.ttlSeconds !== undefined &&
      (typeof auth.ttlSeconds !== 'number' ||
        !Number.isFinite(auth.ttlSeconds) ||
        auth.ttlSeconds <= 0)
    ) {
      throw new Error(`ManifestParser: ${label} oauth2 ttlSeconds must be a positive number`);
    }
  }

  /**
   * True when the top-level authenticator (or, for `selective`, any of its
   * branches) is `oauth2` — used to decide whether GeneratedRefreshToken needs
   * to be auto-registered.
   */
  _usesOAuth2(auth) {
    if (!auth) return false;
    if (auth.type === 'oauth2') return true;
    if (auth.type === 'selective') {
      return Object.values(auth.authenticators || {}).some(sub => sub?.type === 'oauth2');
    }
    return false;
  }

  _collectHosts(raw) {
    const urls = [raw.baseUrl];
    if (raw.authentication?.exchange?.url) urls.push(raw.authentication.exchange.url);
    if (raw.authentication?.tokenUrl) urls.push(raw.authentication.tokenUrl);
    if (raw.authentication?.type === 'selective') {
      for (const sub of Object.values(raw.authentication.authenticators || {})) {
        if (sub?.exchange?.url) urls.push(sub.exchange.url);
        if (sub?.tokenUrl) urls.push(sub.tokenUrl);
      }
    }

    const hosts = new Set();
    for (const u of urls) {
      try {
        hosts.add(new URL(u).hostname);
      } catch {
        throw new Error(`ManifestParser: invalid URL "${u}"`);
      }
    }
    return [...hosts];
  }
}
