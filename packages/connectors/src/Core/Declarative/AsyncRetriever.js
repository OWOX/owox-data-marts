/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { TemplateEngine } from './TemplateEngine.js';
import { getPath } from './pathUtils.js';
import { opaque } from './opaqueValue.js';
import { decodeResponse } from './decoders.js';

/**
 * Async job retriever: submit a job, poll its status until ready (bounded
 * backoff + attempt cap), download the result JSON from the URL in the status
 * response, and extract records. Submit + poll go through the manifest-
 * allowlisted Requester; the download URL is dynamic so it is fetched directly
 * via httpClient under ssrfGuard.assertPublicHttps (https + private-IP block).
 */
export class AsyncRetriever {
  constructor({
    requester,
    httpClient,
    ssrfGuard,
    recordSelector,
    config,
    sleep,
    maxRows = Infinity,
  }) {
    this.requester = requester;
    this.httpClient = httpClient;
    this.ssrfGuard = ssrfGuard;
    this.recordSelector = recordSelector;
    this.config = config;
    this.sleep = sleep || (ms => new Promise(r => setTimeout(r, ms)));
    this.maxRows = maxRows;
    this._tpl = new TemplateEngine();
  }

  async run(scope) {
    const { submit, poll } = this.config;

    // 1. Submit job
    const submitBody = await this.requester.send(submit, scope);
    const jobId = getPath(submitBody, submit.jobIdPath);
    if (jobId === undefined || jobId === null) {
      throw new Error('AsyncRetriever: job id not found at submit.jobIdPath');
    }

    // 2. Poll until ready
    const pollScope = { ...scope, job: { id: jobId } };
    const bo = poll.backoff || {};
    const maxAttempts = bo.maxAttempts || 180;
    const initialMs = bo.initialMs || 3000;
    const maxMs = bo.maxMs || 15000;

    let resultUrl;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Render the poll path with job context before sending, then mark it
      // opaque. The job id comes out of the submit RESPONSE, so it is upstream-
      // controlled: without the marker the Requester would render this path a
      // SECOND time, and a job id of "{{ parameters.ClientSecret }}" would
      // resolve against a scope holding every secret and send it upstream.
      const renderedPollSpec = { ...poll, path: opaque(this._tpl.render(poll.path, pollScope)) };
      const statusBody = await this.requester.send(renderedPollSpec, pollScope);
      const status = getPath(statusBody, poll.statusPath);
      if (status === poll.readyValue) {
        resultUrl = getPath(statusBody, poll.resultUrlPath);
        break;
      }
      if (status === poll.failedValue) {
        throw new Error(`AsyncRetriever: job failed (status "${status}")`);
      }
      await this.sleep(Math.min(initialMs * Math.pow(2, attempt), maxMs));
    }

    if (!resultUrl) {
      throw new Error(`AsyncRetriever: job did not become ready after ${maxAttempts} attempts`);
    }

    // 3. Download result (dynamic URL — public-https guard, no allowlist).
    // Thread the same public-https guard as a per-hop validator so a redirect on
    // the download cannot pivot onto an internal host (SSRF).
    await this.ssrfGuard.assertPublicHttps(resultUrl);
    const validate = nextUrl => this.ssrfGuard.assertPublicHttps(nextUrl);
    const response = await this.httpClient.urlFetchWithRetry(
      resultUrl,
      { method: 'GET' },
      validate
    );
    // Route through the shared decode path so the response-size cap (decoders.js)
    // applies here too — download.format json (csv is a later plan).
    const body = await decodeResponse(response, 'json');

    const records = this.recordSelector.extract(body);
    return this.maxRows === Infinity ? records : records.slice(0, this.maxRows);
  }
}
