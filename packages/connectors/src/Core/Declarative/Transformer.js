/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Applies an ordered list of record transformations to raw API records before
 * field projection/casting. Operates on a deep copy so retriever output is never
 * mutated. Transform types:
 *  - add        { field, value }    set a top-level field to a lenient-templated value
 *  - remove     { field }           delete a top-level field
 *  - keysToLower {}                 lowercase all top-level keys (last wins on collision)
 *  - flatten    { separator? }      recursively flatten nested objects into separator-joined
 *                                   top-level keys (arrays left intact; default separator "_")
 */
export class Transformer {
  /**
   * @param {Array<object>} transformations
   * @param {import('./TemplateEngine.js').TemplateEngine} templateEngine
   */
  constructor(transformations = [], templateEngine) {
    this.transformations = Array.isArray(transformations) ? transformations : [];
    this.templateEngine = templateEngine;
  }

  /**
   * @param {object[]} records - raw records
   * @param {object} scope - run scope (parameters/account/dateWindow/...)
   * @returns {object[]} transformed records (input is not mutated)
   */
  transform(records, scope) {
    return records.map(record => {
      let out = JSON.parse(JSON.stringify(record));
      for (const t of this.transformations) {
        out = this._applyOne(out, t, scope);
      }
      return out;
    });
  }

  _applyOne(record, t, scope) {
    switch (t.type) {
      case 'add':
        record[t.field] = this.templateEngine.render(
          t.value ?? '',
          { ...scope, record },
          { lenient: true }
        );
        return record;
      case 'remove':
        delete record[t.field];
        return record;
      case 'keysToLower': {
        const out = {};
        for (const [k, v] of Object.entries(record)) out[k.toLowerCase()] = v;
        return out;
      }
      case 'flatten':
        return this._flatten(record, t.separator || '_');
      default:
        throw new Error(`Transformer: unknown transformation type "${t.type}"`);
    }
  }

  _flatten(obj, separator) {
    const out = {};
    const walk = (value, prefix) => {
      for (const [k, v] of Object.entries(value)) {
        const key = prefix ? `${prefix}${separator}${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          walk(v, key);
        } else {
          out[key] = v;
        }
      }
    };
    walk(obj, '');
    return out;
  }
}
