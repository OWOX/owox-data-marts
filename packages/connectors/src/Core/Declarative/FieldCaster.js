/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Projects each raw API record into the declared field set: reads each field's
 * nested path (dataPath, else legacy apiName, else the field name) and casts the
 * value to its declared `type`. Missing/empty values become null (never NaN).
 * Object/array values are JSON-stringified so they never become "[object Object]".
 */
function getNested(obj, segments) {
  let value = obj;
  for (const key of segments) {
    value = value == null ? undefined : value[key];
  }
  return value;
}

function castValue(value, type) {
  if (value === undefined || value === null || value === '') return null;
  switch (type) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'integer': {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean':
      return typeof value === 'string' ? value.toLowerCase() === 'true' : Boolean(value);
    case 'date': {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    case 'object':
    case 'string':
    default:
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}

export class FieldCaster {
  /**
   * @param {Record<string, { dataPath?: string, apiName?: string, type: string }>} fields
   */
  constructor(fields = {}) {
    this.fields = fields;
    // The projection plan is fixed by the manifest, so it is resolved ONCE here
    // instead of per record: cast() used to re-run Object.entries(this.fields)
    // (a fresh array of N pair-arrays) and String(path).split('.') (a fresh array
    // per field) for every single record. On a backfill that is one throwaway
    // allocation per field per row, for a value that never changes.
    this.plan = Object.entries(fields).map(([name, def]) => ({
      name,
      segments: String(def.dataPath ?? def.apiName ?? name).split('.'),
      type: def.type,
    }));
  }

  /**
   * @param {object[]} records - raw API records
   * @returns {object[]} projected + cast records
   */
  cast(records) {
    const plan = this.plan;
    return records.map(record => {
      const out = {};
      for (let i = 0; i < plan.length; i++) {
        const field = plan[i];
        out[field.name] = castValue(getNested(record, field.segments), field.type);
      }
      return out;
    });
  }
}
