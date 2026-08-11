/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

/**
 * Resolves the list of accounts to iterate from the manifest `accounts` block.
 * Returns [null] (single passthrough) when no accounts are declared — matching
 * AbstractSource.getAccounts default. Otherwise reads the source string (via an
 * injected resolver that already interpolated `accounts.from`) and parses it
 * into [{ id }] objects.
 */
export class AccountResolver {
  /**
   * @param {object|null} accountsConfig - manifest.accounts (or null)
   * @param {() => string} resolveFrom - returns the interpolated `from` string
   */
  constructor(accountsConfig, resolveFrom) {
    this.config = accountsConfig || null;
    this.resolveFrom = resolveFrom;
  }

  /**
   * @returns {Array<{id: string}|null>}
   */
  resolve() {
    // The only legitimate "this connector has no account concept" path: with no
    // accounts block the resolved value is irrelevant and one null-account pass
    // is correct.
    if (!this.config) return [null];

    const raw = this.resolveFrom();
    // A source that DECLARES accounts but resolves a blank value has nothing to
    // iterate, and that is a configuration error -- so it must reach
    // AbstractConnector._resolveAccounts as [], which fails the run with an
    // actionable message. Returning [null] here short-circuited that guard
    // before the split ran: `AccountIDs = ","` parsed to [] and failed loudly,
    // while `AccountIDs = ""` proceeded with a single null account. '' is the
    // COMMON case, not the exotic one -- a config form submits an untouched
    // optional field as '' (see Requester._renderOptionalMap). And a null
    // account is silently WRONG downstream rather than merely empty:
    // `{{ account.id }}` in queryParameters is dropped by _renderOptionalMap,
    // so the request goes out with no account filter, the API answers with its
    // default scope, rows are written, and the run reports COMPLETED.
    // Whitespace is trimmed for this test regardless of `parse.trim`: " " is as
    // empty an account list as "", and with trim disabled it would otherwise
    // resolve to a single blank-id account.
    if (raw === undefined || raw === null || String(raw).trim() === '') return [];

    const parse = this.config.parse || {};
    const splitRe = parse.split ? new RegExp(parse.split) : /[,;]/;

    return String(raw)
      .split(splitRe)
      .map(part => {
        let id = parse.trim === false ? part : part.trim();
        if (parse.strip) {
          id = id
            .split('')
            .filter(ch => !parse.strip.includes(ch))
            .join('');
        }
        if (parse.prefix) id = parse.prefix + id;
        return id;
      })
      .filter(id => id !== '' && id !== (this.config.parse?.prefix || ''))
      .map(id => ({ id }));
  }
}
