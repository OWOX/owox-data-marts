import * as supertest from 'supertest';
import { AUTH_HEADER } from '../constants';

/**
 * Possible values exposed by `GET /api/reports/:id` in the `lastRunStatus`
 * field. Mirrors the `ReportRunStatus` enum from
 * `apps/backend/src/data-marts/enums/report-run-status.enum.ts`.
 */
type ReportLastRunStatus = 'SUCCESS' | 'ERROR' | 'RUNNING' | 'CANCELLED' | 'RESTRICTED';

interface ReportSnapshot {
  id: string;
  runsCount: number;
  lastRunStatus?: ReportLastRunStatus;
  lastRunError?: string;
  [key: string]: unknown;
}

export interface WaitForReportCompletionOptions {
  agent: supertest.Agent;
  reportId: string;
  /** `runsCount` read BEFORE triggering the run. Helper waits until it increments. */
  runsCountBefore: number;
  /** Wall-clock budget in ms. Default 45 000 (Jest test timeout is 60 000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 45_000;
const POLL_INTERVALS_MS = [300, 600, 1200, 2400] as const;
const MAX_INTERVAL_MS = 3_000;

/**
 * Polls `GET /api/reports/:id` until a triggered report run finalizes.
 *
 * Replaces the legacy `setTimeout(resolve, 5000)` pattern so the test waits
 * exactly as long as needed (typically 1–2 polling iterations given the
 * 5-second `ReportRunTriggerHandlerService` cron) and surfaces clear failures
 * — including the `lastRunError` payload — instead of asserting against a
 * half-written sheet.
 *
 * Stop conditions:
 *   - `runsCount > runsCountBefore` AND `lastRunStatus !== 'RUNNING'` → return.
 *   - `lastRunStatus === 'ERROR'` → throw with `lastRunError` for loud failure.
 *   - elapsed >= timeoutMs → throw with the final observed status.
 */
export async function waitForReportCompletion(
  opts: WaitForReportCompletionOptions
): Promise<ReportSnapshot> {
  const { agent, reportId, runsCountBefore, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const start = Date.now();
  let attempt = 0;
  let last: ReportSnapshot | undefined;

  while (true) {
    const elapsed = Date.now() - start;
    if (elapsed >= timeoutMs) {
      const tail = last
        ? `last status=${last.lastRunStatus ?? 'undefined'}, runsCount=${last.runsCount}`
        : 'no successful poll';
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for report ${reportId} to finish (${tail}).`
      );
    }

    const res = await agent.get(`/api/reports/${reportId}`).set(AUTH_HEADER);
    if (res.status !== 200) {
      throw new Error(
        `GET /api/reports/${reportId} returned ${res.status}: ${JSON.stringify(res.body)}`
      );
    }
    last = res.body as ReportSnapshot;

    if (last.runsCount > runsCountBefore && last.lastRunStatus !== 'RUNNING') {
      if (last.lastRunStatus === 'ERROR') {
        const detail = last.lastRunError ? `: ${last.lastRunError}` : '';
        throw new Error(`Report ${reportId} run finished with status ERROR${detail}`);
      }
      return last;
    }

    const delay = Math.min(POLL_INTERVALS_MS[attempt] ?? MAX_INTERVAL_MS, MAX_INTERVAL_MS);
    attempt++;
    await sleep(delay);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
