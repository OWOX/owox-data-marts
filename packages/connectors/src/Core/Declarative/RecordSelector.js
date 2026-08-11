/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Extracts the record array from a parsed JSON response body using a
 * dot-path (array of keys). A single object at the path is wrapped into a
 * one-element array; an empty path returns the whole body as one record.
 */
export class RecordSelector {
  /**
   * @param {{ recordPath?: string[] }} config
   */
  constructor(config = {}) {
    this.recordPath = Array.isArray(config.recordPath) ? config.recordPath : [];
  }

  /**
   * @param {any} body - parsed JSON body
   * @returns {object[]}
   */
  extract(body) {
    let node = body;
    for (const key of this.recordPath) {
      node = node == null ? undefined : node[key];
    }
    if (node === undefined || node === null) return [];
    if (Array.isArray(node)) return node;
    return [node];
  }
}
