import { z } from 'zod';
import type { McpReportRunOutcome } from '../../../data-marts/facades/mcp-reports.facade';

/**
 * Result shape of a Report Run a write tool queued on the caller's behalf —
 * add_report's initial run and update_report's refresh run share it, so the
 * agent handles both with the same polling rule.
 */
export const reportRunOutcomeSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('queued'),
    run_id: z.string(),
    should_poll: z.literal(true),
    message: z.string(),
  }),
  z.object({
    status: z.literal('not_requested'),
    should_poll: z.literal(false),
    message: z.string(),
  }),
  z.object({
    status: z.literal('not_applicable'),
    should_poll: z.literal(false),
    message: z.string(),
  }),
  z.object({
    status: z.literal('failed_to_queue'),
    should_poll: z.literal(false),
    error: z.string(),
    message: z.string(),
  }),
]);

export type ReportRunOutcomeOutput = z.infer<typeof reportRunOutcomeSchema>;

/** Per-tool wording of what each outcome means and what to do next. */
export interface ReportRunOutcomeMessages {
  queued: string;
  not_requested: string;
  not_applicable: string;
  failed_to_queue: string;
}

export function toReportRunOutcomeOutput(
  outcome: McpReportRunOutcome,
  messages: ReportRunOutcomeMessages
): ReportRunOutcomeOutput {
  switch (outcome.status) {
    case 'queued':
      return {
        status: 'queued',
        run_id: outcome.run_id,
        should_poll: true,
        message: messages.queued,
      };
    case 'not_requested':
      return { status: 'not_requested', should_poll: false, message: messages.not_requested };
    case 'not_applicable':
      return { status: 'not_applicable', should_poll: false, message: messages.not_applicable };
    case 'failed_to_queue':
      return {
        status: 'failed_to_queue',
        should_poll: false,
        error: outcome.error,
        message: messages.failed_to_queue,
      };
  }
}
