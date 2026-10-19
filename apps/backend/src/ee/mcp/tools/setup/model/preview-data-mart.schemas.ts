import { z } from 'zod-v4';
import {
  DataMartStatus,
  DataMartDefinitionType,
} from '../../../../../data-marts/facades/mcp-data-mart-setup.facade';

export const previewInput = z
  .object({
    dataMartId: z.string().uuid(),
    limit: z.number().int().min(1).max(1000).default(10),
  })
  .strict();

export const previewOutput = z
  .object({
    dataMartId: z.string(),
    revision: z.number().int().positive(),
    observedModifiedAt: z.string().datetime(),
    observedStatus: z.enum(DataMartStatus),
    observedDefinitionType: z.enum(DataMartDefinitionType).nullable(),
    currentness: z.enum(['not-guaranteed', 'changed-during-preview']),
    schema: z
      .object({
        freshness: z.enum(['current', 'stale', 'missing']),
        inputRevision: z.number().int().nonnegative().nullable(),
        actualizedAt: z.string().datetime().nullable(),
      })
      .strict(),
    columns: z.array(
      z
        .object({ name: z.string(), alias: z.string().optional(), type: z.string().optional() })
        .strict()
    ),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(1000),
    rowCount: z.number().int().min(0).max(1000),
    limit: z.number().int().min(1).max(1000),
    truncated: z.boolean(),
    payloadTruncated: z.boolean(),
    warehouseChargesApply: z.literal(true),
    warehouseTimeout: z.literal('provider-dependent'),
    reportRunCreated: z.literal(false),
    owoxConsumptionRecorded: z.literal(false),
  })
  .strict();
