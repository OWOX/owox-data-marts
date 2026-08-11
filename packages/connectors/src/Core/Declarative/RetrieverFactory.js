/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { SyncRetriever } from './SyncRetriever.js';
import { AsyncRetriever } from './AsyncRetriever.js';
import { SubstreamRetriever } from './SubstreamRetriever.js';
import { ListPartitionRetriever } from './ListPartitionRetriever.js';
import { RecordSelector } from './RecordSelector.js';
import { Paginator } from './Paginator.js';

/**
 * Builds the right retriever for a node from its `retriever.type`
 * (default 'sync'). Sync uses node.request; async uses node.retriever.{submit,
 * poll,download}. Both extract via a RecordSelector built from the node.
 */
export class RetrieverFactory {
  /**
   * @param {object} node - raw manifest node
   * @param {{requester, httpClient, ssrfGuard, sleep?, requestSpec?, context?}} deps
   */
  static build(node, deps, options = {}) {
    if (node.partitionRouter) {
      const common = {
        requester: deps.requester,
        partitionRouter: node.partitionRouter,
        childRequestSpec: deps.requestSpec || node.request,
        childRecordSelector: new RecordSelector(node.recordSelector || {}),
        childPagination: node.pagination || { type: 'none' },
        maxPages: options.maxPages,
        maxRows: options.maxRows,
        maxSlices: options.maxSlices,
      };
      return node.partitionRouter.type === 'list'
        ? new ListPartitionRetriever(common)
        : new SubstreamRetriever(common);
    }

    const type = node.retriever?.type || 'sync';

    if (type === 'async') {
      const recordPath =
        node.retriever.download?.recordPath ?? node.recordSelector?.recordPath ?? [];
      return new AsyncRetriever({
        requester: deps.requester,
        httpClient: deps.httpClient,
        ssrfGuard: deps.ssrfGuard,
        recordSelector: new RecordSelector({ recordPath }),
        config: node.retriever,
        sleep: deps.sleep,
        maxRows: options.maxRows,
      });
    }

    return new SyncRetriever({
      requester: deps.requester,
      recordSelector: new RecordSelector(node.recordSelector || {}),
      requestSpec: deps.requestSpec || node.request,
      paginator: new Paginator(node.pagination || { type: 'none' }),
      maxPages: options.maxPages,
      maxRows: options.maxRows,
      context: deps.context,
    });
  }
}
