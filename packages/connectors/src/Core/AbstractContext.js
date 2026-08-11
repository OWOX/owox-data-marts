/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// packages/connectors/src/Core/AbstractContext.js
import { LogEvent } from './Events/LogEvent.js';
import { CredentialsEvent } from './Events/CredentialsEvent.js';
import { FieldsEvent } from './Events/FieldsEvent.js';
import { AnalyticsEvent } from './Events/AnalyticsEvent.js';
import {
  RUN_CONFIG_TYPE,
  CONFIG_ATTRIBUTES,
  PARAMETER_OWNER,
} from '../Constants/CommonConstants.js';

export class AbstractContext {
  constructor({ source, storage, runConfig, env }) {
    if (!source?.name) throw new Error('source.name is required');
    if (!source?.config) throw new Error('source.config is required');
    if (!storage?.name) throw new Error('storage.name is required');
    if (!storage?.config) throw new Error('storage.config is required');

    this.sourceName = source.name;
    this.storageName = storage.name;
    this.sourceConfig = { ...source.config };
    this.storageConfig = { ...storage.config };

    this.runConfig = {
      type: runConfig?.type || RUN_CONFIG_TYPE.INCREMENTAL,
      data: runConfig?.data || [],
      state: runConfig?.state || {},
    };

    this.env = {
      datamartId: env?.datamartId || null,
      runId: env?.runId || null,
    };

    this._parameterDefinitions = {};
  }

  /**
   * Register parameter definitions from Source or Storage.
   * Called by Source/Storage constructors to declare their expected parameters.
   * @param {object} params - Parameter definitions
   * @param {'source'|'storage'} owner - Which config to apply defaults to
   */
  registerParameters(params, owner = PARAMETER_OWNER.SOURCE) {
    if (owner !== PARAMETER_OWNER.SOURCE && owner !== PARAMETER_OWNER.STORAGE) {
      throw new Error(
        `registerParameters owner must be '${PARAMETER_OWNER.SOURCE}' or '${PARAMETER_OWNER.STORAGE}', got: ${owner}`
      );
    }
    const targetForDefaults =
      owner === PARAMETER_OWNER.STORAGE ? this.storageConfig : this.sourceConfig;

    for (const [name, definition] of Object.entries(params)) {
      const cleanName = name.endsWith('*') ? name.slice(0, -1) : name;
      const isRequired = name.endsWith('*') ? true : definition.isRequired || false;

      this._parameterDefinitions[cleanName] = {
        ...definition,
        isRequired,
      };

      // Find existing config entry (could be in either config since the parameter
      // value may have been provided externally regardless of who registered it).
      const existingConfig =
        this.sourceConfig[cleanName] !== undefined
          ? this.sourceConfig
          : this.storageConfig[cleanName] !== undefined
            ? this.storageConfig
            : null;

      if (existingConfig) {
        // Param exists — ensure { value } shape (handles cases where raw values were provided)
        if (typeof existingConfig[cleanName] !== 'object' || existingConfig[cleanName] === null) {
          existingConfig[cleanName] = { value: existingConfig[cleanName] };
        }
      } else {
        // main parity: stub EVERY declared param (addParameter did this unconditionally),
        // so a no-default runtime param (e.g. AccessToken) is a live object a connector can write.
        targetForDefaults[cleanName] = { value: definition.default };
      }

      // main parity (AbstractConfig.addParameter/_trimValue): every string
      // param value is trimmed at ingestion time, regardless of whether a
      // requiredType/type is declared. Previously this only happened inside
      // _validateParameterType('string'), which never ran for untyped params
      // (e.g. an AccountId with no declared type), so "  12345  " kept its
      // whitespace all the way through to the API request.
      const container = existingConfig || targetForDefaults;
      const entry = container[cleanName];
      if (entry && typeof entry.value === 'string') {
        entry.value = entry.value.trim();
      }
    }
  }

  /**
   * Validate all registered parameters against config values.
   * Ported from AbstractConfig.validate() and AbstractRunConfig.validate().
   */
  validate() {
    for (const [name, def] of Object.entries(this._parameterDefinitions)) {
      const param = this.getParameter(name);

      // main parity: an empty value falls back to default.
      if (
        param &&
        def.default !== undefined &&
        (param.value === undefined || param.value === null || param.value === '')
      ) {
        param.value = def.default;
      }

      // Check required
      if (
        def.isRequired &&
        (!param || param.value === undefined || param.value === null || param.value === '')
      ) {
        // main parity (AbstractConfig.validate): a param-defined errorMessage
        // takes precedence over the generic message, so connectors that
        // declare one (e.g. MicrosoftAds, OpenExchangeRates, Shopify) surface
        // an actionable, source-specific diagnosis. The generic wording is
        // main's verbatim and user-facing; it is pinned in full by
        // tests/AbstractContext.test.js, "validates required parameters,
        // pinning the generic message verbatim". Every other check on this
        // message matches a fragment only -- connector-fields.e2e-spec asserts
        // the substring "parameter 'AuthType' is required", the connector
        // tests use partial regexes -- so that one pin, not the substring
        // matchers, is what catches a reworded prefix or suffix.
        throw new Error(
          def.errorMessage ||
            `Unable to load the configuration. The parameter '${name}' is required but was provided with an empty value`
        );
      }

      // Skip validation for empty optional params
      if (!param || param.value === undefined || param.value === null || param.value === '') {
        continue;
      }

      // oneOf selector params (e.g. OAuth AuthType) route to their own validation
      // instead of the generic type check -- the selector's own value (e.g. "oauth2")
      // is not itself of `requiredType`, only the resolved option's `items` are.
      if (def.oneOf && Array.isArray(def.oneOf)) {
        this._validateOneOf(name, param);
        continue;
      }

      // Type validation
      if (def.requiredType || def.type) {
        const requiredType = def.requiredType || def.type;
        this._validateParameterType(name, param, requiredType);
      }
    }

    // Validate runConfig
    this._validateRunConfig();
  }

  /**
   * Validate a oneOf selector parameter (e.g. OAuth AuthType): the parameter's
   * `value` selects one of `oneOf`'s options, and that option's declared
   * `items` are then required/type-checked against `parameter.items`.
   * Ported from main's AbstractConfig._validateOneOf.
   * @param {string} name - Parameter name
   * @param {object} parameter - Parameter config ({ value, items })
   */
  _validateOneOf(name, parameter) {
    if (!parameter || !parameter.value) {
      if (this._parameterDefinitions[name]?.isRequired) {
        throw new Error(`Parameter '${name}' is required but no value selected`);
      }
      return;
    }
    const def = this._parameterDefinitions[name];
    const selected = def.oneOf.find(opt => opt.value === parameter.value);
    if (!selected) {
      const valid = def.oneOf.map(o => o.value).join(', ');
      throw new Error(
        `Parameter '${name}' has invalid value '${parameter.value}'. Valid options: ${valid}`
      );
    }
    if (selected.items && parameter.items) {
      for (const itemName in selected.items) {
        const itemCfg = selected.items[itemName];
        const itemVal = parameter.items[itemName];
        if (itemCfg.isRequired && (!itemVal || (!itemVal.value && itemVal.value !== 0))) {
          throw new Error(`Parameter '${name}.${itemName}' is required but was not provided`);
        }
        if (itemVal)
          this._validateParameterType(
            `${name}.${itemName}`,
            itemVal,
            itemCfg.requiredType || itemCfg.type
          );
      }
    }
  }

  _validateParameterType(name, param, requiredType) {
    const value = param.value;
    switch (requiredType) {
      case 'string':
        if (typeof value === 'string') {
          param.value = value.trim();
        }
        break;
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Parameter "${name}" must be a number, got: ${value}`);
        }
        param.value = num;
        break;
      case 'boolean':
        if (typeof value === 'string') {
          param.value = value.toLowerCase() === 'true';
        }
        break;
      case 'date': {
        // main parity (AbstractConfig._validateParameterType): only an
        // already-constructed Date, or a string in the strict YYYY-MM-DD
        // format, is accepted -- any other Date-parseable format (e.g.
        // "01/15/2024") is rejected even though `new Date(...)` would parse
        // it fine. A valid string is cast to a Date and reassigned back to
        // param.value, matching main's cast-and-store behavior.
        if (value instanceof Date) {
          if (isNaN(value.getTime())) {
            throw new Error(`Parameter "${name}" must be a valid date, got: ${value}`);
          }
          break;
        }
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          const parsed = new Date(value);
          if (isNaN(parsed.getTime())) {
            throw new Error(`Parameter "${name}" must be a valid date, got: ${value}`);
          }
          param.value = parsed;
          break;
        }
        throw new Error(`Parameter "${name}" must be a valid date, got: ${value}`);
      }
      case 'object':
        if (typeof value === 'string') {
          try {
            param.value = JSON.parse(value);
          } catch (e) {
            throw new Error(`Parameter "${name}" must be valid JSON, got: ${value}`);
          }
        }
        break;
    }
  }

  _validateRunConfig() {
    if (this.runConfig.type === RUN_CONFIG_TYPE.MANUAL_BACKFILL) {
      if (!this.runConfig.data || this.runConfig.data.length === 0) {
        throw new Error('Manual backfill requires data items');
      }
      for (const item of this.runConfig.data) {
        if (!item.configField || item.value === undefined) {
          throw new Error('Manual backfill data items must have configField and value');
        }
        const paramDef = this._parameterDefinitions[item.configField];
        // main parity (AbstractRunConfig._validateManualBackfill): the field must
        // exist AND explicitly opt in via attributes.includes(MANUAL_BACKFILL).
        // A missing/undefined `attributes` (the normal shape for most params) is
        // NOT an implicit allow -- every field must opt in, else ANY config value
        // (secrets, API endpoints, etc.) would be overridable via a backfill run.
        if (
          !paramDef ||
          !paramDef.attributes ||
          !paramDef.attributes.includes(CONFIG_ATTRIBUTES.MANUAL_BACKFILL)
        ) {
          throw new Error(`Config field "${item.configField}" does not support manual backfill`);
        }
      }
    }
  }

  /**
   * Look up a parameter by name. Checks sourceConfig first, then storageConfig.
   */
  getParameter(name) {
    if (this.sourceConfig[name] !== undefined) return this.sourceConfig[name];
    if (this.storageConfig[name] !== undefined) return this.storageConfig[name];
    return null;
  }

  /**
   * Emit an event to stdout (newline-delimited JSON).
   */
  emit(event) {
    process.stdout.write(JSON.stringify(event.toJSON()) + '\n');
  }

  /**
   * Shortcut to emit a LogEvent.
   */
  log(level, message) {
    this.emit(new LogEvent(level, message));
  }

  /**
   * Emit a CREDENTIALS event so the host can persist rotated secrets (e.g. an
   * OAuth refresh token the provider rotated mid-run). The backend translates
   * the event into a credentials-update message, allowlists the fields, and
   * re-injects them as runtime parameters on the next run.
   *
   * @param {Object<string, unknown>} credentials - Credential fields to update.
   */
  updateCredentials(credentials) {
    this.emit(new CredentialsEvent(credentials));
  }

  /**
   * Emit a FIELDS event so the host can persist a field list the run discovered
   * rather than one the user picked up front. Sources whose schema only exists
   * in the data — a spreadsheet's header row, say — call this once the real
   * columns are known, so the data mart stops showing a stale selection.
   *
   * @param {string[]} fields - Field names the run actually wrote.
   */
  updateFields(fields) {
    this.emit(new FieldsEvent(fields));
  }

  /**
   * Shortcut to emit an AnalyticsEvent — a tagged numeric metric surfaced in the
   * run log stream and aggregated into the loading-status summary.
   */
  emitAnalytics(metric, value, tags = {}) {
    this.emit(new AnalyticsEvent(metric, value, tags));
  }
}
