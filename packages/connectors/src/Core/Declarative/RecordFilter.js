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
        return v != null && resolveValueList(this.config, scope).includes(String(v));
      default:
        return true;
    }
  }
}
