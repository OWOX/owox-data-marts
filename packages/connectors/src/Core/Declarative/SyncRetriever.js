/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { TraceEvent } from '../Events/TraceEvent.js';
import { unwrapOpaque } from './opaqueValue.js';
import { redactUrl } from '../AbstractSource.js';
import { LOG_LEVEL } from '../../Constants/CommonConstants.js';

/**
 * Synchronous retriever: sends requests through the Requester and extracts
 * records via the RecordSelector. With a Paginator it loops over pages,
 * accumulating records, until the paginator returns null or maxPages is hit.
 * Without a paginator (or 'none'), it fetches exactly one page.
 */
export class SyncRetriever {
  /**
   * @param {object} deps
   * @param {import('./Requester.js').Requester} deps.requester
   * @param {import('./RecordSelector.js').RecordSelector} deps.recordSelector
   * @param {object} deps.requestSpec - the node's request definition
   * @param {import('./Paginator.js').Paginator} [deps.paginator]
   * @param {number} [deps.maxPages] - hard cap (anti-DoS), default 10000
   * @param {number} [deps.maxRows] - optional row cap for live test runs; default Infinity
   * @param {import('../AbstractContext.js').AbstractContext} [deps.context] - run context; when provided, emits an `http_response` TRACE per page
   */
  constructor({
    requester,
    recordSelector,
    requestSpec,
    paginator = null,
    maxPages = 10000,
    maxRows = Infinity,
    context = null,
  }) {
    this.requester = requester;
    this.recordSelector = recordSelector;
    this.requestSpec = requestSpec;
    this.paginator = paginator;
    this.maxPages = maxPages;
    this.maxRows = maxRows;
    this.context = context;
  }

  /**
   * @param {object} scope - template scope
   * @returns {Promise<object[]>} raw extracted records (pre-cast), all pages, capped at maxRows
   */
  async run(scope) {
    let request = this.requestSpec;
    // Collected per page and flattened once, never `all.push(...records)`:
    // spreading passes every record as a separate argument and blows V8's
    // argument limit (~125k) with "RangeError: Maximum call stack size
    // exceeded". A single page can be an entire file — `responseFormat`
    // 'csv'/'jsonl' decode a body of up to 64 MiB (decoders.js) into one flat
    // array, ~670k records at 100 bytes/row — so this is reachable, not
    // theoretical. Same idiom, and the same reason, as
    // AbstractConnector.processFullRefreshNode.
    const batches = [];
    let total = 0;
    let pages = 0;
    const wantHeaders = !!this.paginator?.needsHeaders?.();

    // maxPages is the iteration budget for every paginator type alike (page/
    // offset/cursor) — a cursor that never goes absent still stops here, so
    // no cursor-specific cap is needed (see Paginator.js's iteration-budget note).
    // The check lives INSIDE the loop (the iteration count is unchanged) so that
    // exhausting the budget can be told apart from the paginator ending the run
    // naturally — otherwise the two are indistinguishable in the return value and
    // a truncated node reports success while the cursor advances past unread data.
    while (request && total < this.maxRows) {
      if (pages >= this.maxPages) {
        this._reportPageBudgetExhausted(request);
        break;
      }
      let body;
      let headers;
      if (wantHeaders) {
        ({ body, headers } = await this.requester.send(request, scope, { withHeaders: true }));
      } else {
        body = await this.requester.send(request, scope);
      }
      const records = this.recordSelector.extract(body);
      if (this.context && records.length > 0) {
        this.context.emit(new TraceEvent('http_response', { records: records.length }));
      }
      const remaining = this.maxRows - total;
      if (records.length > remaining) {
        // remaining is >= 1 here (the loop condition guarantees total < maxRows),
        // so this slice is never empty.
        batches.push(records.slice(0, remaining));
        total += remaining;
        break;
      }
      if (records.length > 0) {
        batches.push(records);
        total += records.length;
      }
      pages += 1;
      request = this.paginator
        ? this.paginator.next({ response: body, headers, request, recordCount: records.length })
        : null;
    }

    // One batch is returned as-is rather than copied; zero batches flat() to [].
    return batches.length === 1 ? batches[0] : batches.flat();
  }

  /**
   * Reports that the page budget, not the paginator, ended the loop.
   *
   * Without this the loop just exited and returned what it had: no log, no error,
   * indistinguishable from "the paginator said stop". The node reported success
   * and the cursor advanced over pages that were never fetched.
   *
   * INFO for the same reason as Requester._reportIgnored: WARN is the backend's
   * run-failure channel (LOG(warn) -> ConnectorMessageType.WARNING -> configErrors
   * -> success = false). maxPages is additionally the normal stop for a live test
   * run — connector-test.service.ts caps it at 1 by default — so at WARN every
   * builder test run of a paginated node would report as FAILED.
   *
   * The target is REDACTED (origin + path only) for the same reason as
   * Requester._reportIgnored: this is a persisted, viewer-readable run log, and
   * `pendingRequest` is the NEXT page — i.e. the link the upstream returned,
   * which echoes back whatever the caller sent, including an
   * `authentication.inject.into: "query"` credential. That makes this the most
   * exposed of the two sites, not the least: maxPages is 1 for a builder live
   * test, so every test run of a link-paginated node reaches this line.
   */
  _reportPageBudgetExhausted(pendingRequest) {
    if (!this.context?.log) return;
    // Paginator injects the next page marked opaque, so unwrap before redacting
    // — otherwise `redactUrl` would be handed an OpaqueValue, not a string.
    const raw = unwrapOpaque(pendingRequest?.url) || unwrapOpaque(pendingRequest?.path) || '';
    const target = raw ? redactUrl(raw) : '';
    this.context.log(
      LOG_LEVEL.INFO,
      `Stopped after the maximum of ${this.maxPages} page(s) for (${target}) while the paginator ` +
        `still had a next page: any remaining records were NOT imported.`
    );
  }
}
