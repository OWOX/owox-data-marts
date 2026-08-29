/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { getPath } from './pathUtils.js';
import { resolveValueList } from './valueList.js';

/**
 * Keeps an extracted record when a single structured condition holds. Operators:
 * equals | notEquals | contains | isNotNull | isNull | inList. Used as a
 * DeclarativeSource stage before transformations. No expression evaluation.
 */
export class RecordFilter {
  constructor(config = {}) {
    this.config = config;
    // `inList` re-derived its whole value list per record and then linear-scanned
    // it, although the list is identical for every record in the batch. A literal
    // list (`values` / `value`) cannot depend on the scope, so it is resolved once
    // here; a `valuesFromParameter` list can, so it is memoized lazily in
    // _inListSet — keyed on the raw parameter VALUE, not on scope object identity,
    // so a scope rebuilt between calls still hits while a genuinely different
    // parameter still misses. Set membership replaces Array#includes because
    // resolveValueList only ever yields strings, for which has() and includes()
    // agree exactly.
    this._staticSet =
      config.operator === 'inList' && !config.valuesFromParameter
        ? new Set(resolveValueList(config, null))
        : null;
    // A separate validity flag, not an `undefined` marker on _memoRaw: a
    // valuesFromParameter naming a parameter that is not set resolves to
    // undefined legitimately, and conflating the two would re-resolve the
    // (empty) list on every single record — the exact cost being removed.
    this._memoValid = false;
    this._memoRaw = undefined;
    this._memoSet = null;
  }

  _inListSet(scope) {
    if (this._staticSet) return this._staticSet;
    const raw = scope?.parameters?.[this.config.valuesFromParameter];
    if (!this._memoValid || raw !== this._memoRaw) {
      this._memoValid = true;
      this._memoRaw = raw;
      this._memoSet = new Set(resolveValueList(this.config, scope));
    }
    return this._memoSet;
  }

  /** @returns {boolean} true to keep the record */
  keep(record, scope) {
    const { path, operator, value } = this.config;
    const v = getPath(record, path || []);
    switch (operator) {
      case 'isNull':
        return v == null;
      case 'isNotNull':
        return v != null;
      case 'equals':
        return v != null && String(v) === value;
      case 'notEquals':
        return v == null || String(v) !== value;
      case 'contains':
        return v != null && String(v).includes(value);
      case 'inList':
        return v != null && this._inListSet(scope).has(String(v));
      default:
        return true;
    }
  }
}
