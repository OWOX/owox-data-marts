/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * A value that came out of an upstream RESPONSE and must therefore never be
 * interpolated as a template.
 *
 * Why this exists: the template scope carries every SECRET parameter plus
 * `auth.token`. Anything rendered through it can read that scope. The network
 * boundary (SsrfGuard) is treated adversarially, but response BODIES were not —
 * so a pagination cursor of `"{{ parameters.ClientSecret }}"`, or an async job id
 * of the same shape, used to be rendered with the full scope and sent onward to a
 * host the manifest author chose. `_redactUrl` drops the query string from the
 * trace, so the exfiltration left no evidence either.
 *
 * The marker rides on the VALUE rather than on its location in the request, so
 * the guarantee cannot be lost by copying a request spec around. It is also
 * self-enforcing: `TemplateEngine.render` returns any non-string unchanged, so an
 * OpaqueValue that reaches a render call site nobody updated comes back intact
 * instead of being expanded. Callers unwrap it at the point of use — i.e. the
 * literal is substituted AFTER rendering, never through it.
 *
 * The wrapped value keeps its original type (a body inject may legitimately need
 * a number), so unwrap before anything that requires a string.
 */
export class OpaqueValue {
  constructor(value) {
    this.value = value;
  }

  toString() {
    return String(this.value);
  }
}

/**
 * @param {*} value
 * @returns {OpaqueValue} `value` marked as response-derived (idempotent)
 */
export function opaque(value) {
  return value instanceof OpaqueValue ? value : new OpaqueValue(value);
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isOpaque(value) {
  return value instanceof OpaqueValue;
}

/**
 * @param {*} value
 * @returns {*} the wrapped literal, or `value` itself when it is not opaque
 */
export function unwrapOpaque(value) {
  return value instanceof OpaqueValue ? value.value : value;
}
