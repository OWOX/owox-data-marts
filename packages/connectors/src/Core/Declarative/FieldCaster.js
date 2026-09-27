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

// How APIs spell a boolean in text. Anything else is not read as either.
const TRUE_TEXT = new Set(['true', '1', 'yes', 'y', 't', 'on']);
const FALSE_TEXT = new Set(['false', '0', 'no', 'n', 'f', 'off']);

// A date and time with no zone. JavaScript reads one as local time; the run's zone is not the
// API's, so it is read as UTC, which is what a storage writes a Date as.
const ZONELESS_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
// JavaScript already reads a bare YYYY-MM-DD as UTC.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAMES_A_ZONE = /Z$|[+-]\d{2}:?\d{2}\b|\bGMT\b|\bUTC\b/i;

function toDate(value) {
  if (typeof value !== 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const text = value.trim();
  const d = new Date(ZONELESS_DATETIME.test(text) ? `${text.replace(' ', 'T')}Z` : text);
  if (Number.isNaN(d.getTime())) return null;
  if (ZONELESS_DATETIME.test(text) || ISO_DATE.test(text) || NAMES_A_ZONE.test(text)) return d;
  // Any other text without a zone ("01/15/2024", "Jan 15, 2024") was read in the host's zone:
  // keep the wall-clock time it names, in UTC.
  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds()
    )
  );
}

function castValue(value, type) {
  if (value === undefined || value === null || value === '') return null;
  switch (type) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case 'integer': {
      // Not parseInt: it stops at the first character it cannot read, so "1e5" became 1. Ids
      // beyond 2^53 lose digits either way; the type for them is string.
      const n = Math.trunc(Number(value));
      return Number.isFinite(n) ? n : null;
    }
    case 'boolean': {
      if (typeof value !== 'string') return Boolean(value);
      const text = value.trim().toLowerCase();
      if (TRUE_TEXT.has(text)) return true;
      return FALSE_TEXT.has(text) ? false : null;
    }
    case 'date':
    case 'datetime':
      return toDate(value);
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
