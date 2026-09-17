/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Resolves {{ scope.path }} placeholders from a fixed set of whitelisted
 * scopes. NOT a general expression engine — no eval, no function calls, no
 * access to globals. This is the only place manifest strings are interpolated,
 * so it is a security boundary (see SsrfGuard for the network boundary).
 */
const ALLOWED_SCOPES = new Set([
  'parameters',
  'account',
  'auth',
  'node',
  'dateWindow',
  'response',
  'job',
  'record',
  'stream_slice',
]);

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export class TemplateEngine {
  /**
   * @param {string} template
   * @param {Record<string, any>} scope - object keyed by allowed scope names
   * @param {{ lenient?: boolean, onUnresolved?: (path: string) => void }} [options]
   * @returns {string} interpolated string (non-strings returned unchanged)
   */
  render(template, scope, { lenient = false, onUnresolved } = {}) {
    if (typeof template !== 'string') return template;

    return template.replace(PLACEHOLDER, (_match, path) => {
      const [head, ...rest] = path.split('.');
      if (!ALLOWED_SCOPES.has(head)) {
        throw new Error(`Template scope "${head}" is not allowed`);
      }
      let value = scope[head];
      for (const key of rest) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          throw new Error(`Template path "${path}" contains an unsafe segment "${key}"`);
        }
        value = value == null ? undefined : value[key];
      }
      if (value === undefined || value === null) {
        if (onUnresolved) onUnresolved(path);
        if (lenient) return '';
        throw new Error(`Template path "${path}" is unresolved`);
      }
      return String(value);
    });
  }

  /**
   * Renders a value that is allowed to be absent. Returns undefined when any
   * placeholder was unresolved, so the caller can omit the key entirely rather
   * than emitting an empty value. A value that legitimately resolves to "" is
   * NOT treated as absent. Scope/segment violations still throw — those are
   * authoring errors, not optional values.
   *
   * @param {string} template
   * @param {Record<string, any>} scope
   * @returns {string|undefined}
   */
  renderOptional(template, scope) {
    let unresolved = false;
    const value = this.render(template, scope, {
      lenient: true,
      onUnresolved: () => {
        unresolved = true;
      },
    });
    return unresolved ? undefined : value;
  }
}
