import { z } from 'zod';
import { manualBackfillWindowError } from '../../../../data-marts/dto/domain/connector-run-payload.validation';

const id = z.string().trim().min(1);
const payload = z
  .object({
    runType: z.enum(['INCREMENTAL', 'MANUAL_BACKFILL']).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 1024 * 1024) {
      ctx.addIssue({ code: 'custom', message: 'Run payload must not exceed 1 MB.' });
    }
    if (value.runType === 'MANUAL_BACKFILL' && value.data) {
      const message = manualBackfillWindowError(value.data, { includeValues: false });
      if (message) ctx.addIssue({ code: 'custom', message });
    }
  });
export const runDataMartSchema = z
  .object({ data_mart_id: id, payload: payload.optional() })
  .strict();
export const dataMartRunRefSchema = z.object({ data_mart_id: id, run_id: id }).strict();
export const listDataMartRunsSchema = z
  .object({
    data_mart_id: id,
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().nonnegative().default(0),
  })
  .strict();
export const listDataMartRunSchedulesSchema = z.object({ data_mart_id: id }).strict();
export const deleteDataMartRunScheduleSchema = z
  .object({ data_mart_id: id, trigger_id: id })
  .strict();
export const createDataMartRunScheduleSchema = z
  .object({
    data_mart_id: id,
    cron_expression: id.max(255),
    time_zone: id.max(100).default('UTC'),
    is_active: z.boolean().default(true),
  })
  .strict();
export const updateDataMartRunScheduleSchema = z
  .object({
    data_mart_id: id,
    trigger_id: id,
    cron_expression: id.max(255),
    time_zone: id.max(100).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
export const runOutputSchema = {
  data_mart_id: z.string(),
  run_id: z.string(),
  status: z.string(),
  type: z.string(),
  run_type: z.string(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  error_summary: z
    .string()
    .max(1000)
    .nullable()
    .describe(
      'This is a safe failure summary. Provider details may require viewing Run History in OWOX.'
    ),
  should_poll: z
    .boolean()
    .describe(
      'This indicates whether to poll this run segment. It does not describe completion of a backfill chain.'
    ),
  backfill: z
    .object({
      chain_id: z.string(),
      segment_index: z.number().int().positive(),
      segments_total: z.number().int().positive(),
    })
    .optional(),
};
export const scheduleOutputSchema = {
  data_mart_id: z.string(),
  trigger_id: z.string(),
  cron_expression: z.string(),
  time_zone: z.string(),
  is_active: z.boolean(),
  next_run_at: z.string().nullable(),
  last_run_at: z.string().nullable(),
};
