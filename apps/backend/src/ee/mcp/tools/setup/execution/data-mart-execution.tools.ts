import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_EXECUTION_FACADE,
  type McpDataMartExecutionFacade,
  DataMartRunStatus,
  DataMartRunType,
  RunType,
} from '../../../../../data-marts/facades/mcp-data-mart-execution.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';

const martInput = z.object({ dataMartId: z.uuid() }).strict();
const runInput = martInput.extend({ runId: z.uuid() }).strict();
const dateRange = z.object({ startDate: z.iso.date(), endDate: z.iso.date() }).strict();
const runOutput = z
  .object({
    id: z.string(),
    dataMartId: z.string(),
    type: z.enum(DataMartRunType),
    status: z.enum(DataMartRunStatus),
    runType: z.enum(RunType),
    configurationRevision: z.number().int().positive().nullable(),
    currentConfigurationRevision: z.number().int().positive(),
    configurationCurrent: z.boolean().nullable(),
    createdAt: z.iso.datetime(),
    startedAt: z.iso.datetime().nullable(),
    finishedAt: z.iso.datetime().nullable(),
    diagnostics: z
      .object({
        logsAvailable: z.boolean(),
        errorsAvailable: z.boolean(),
        content: z.literal('withheld'),
      })
      .strict(),
    load: z
      .object({
        runType: z.enum(['INCREMENTAL', 'MANUAL_BACKFILL']).nullable(),
        dateRange: dateRange.nullable(),
      })
      .strict()
      .nullable(),
    backfillChain: z
      .object({
        id: z.string(),
        requestedStart: z.iso.date(),
        requestedEnd: z.iso.date(),
        segmentIndex: z.number().int().min(1),
        segmentsTotal: z.number().int().min(1),
        segmentDays: z.number().int().min(1).optional(),
      })
      .strict()
      .nullable(),
  })
  .strict();
const scheduleOutput = z
  .object({
    id: z.string(),
    cronExpression: z.string(),
    timeZone: z.string(),
    enabled: z.boolean(),
    nextRunAt: z.iso.datetime().nullable(),
    revision: z.number().int().positive(),
    loadParameters: z
      .object({ mode: z.literal('connector-default'), configurable: z.literal(false) })
      .strict(),
    recurringEffect: z.string(),
  })
  .strict();

@Injectable()
export class GetDataMartRunTool implements McpToolDefinition<z.input<typeof runInput>> {
  readonly name = 'get_data_mart_run';
  readonly description =
    'Read stored Data Mart run status, connector load dates and backfill segment identity under current SEE permission. Raw diagnostics, configuration and provider payloads are withheld. A failed or unknown run is never retried.';
  readonly zodSchema = runInput.shape;
  readonly outputSchema = runOutput.shape;
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly execution: McpDataMartExecutionFacade
  ) {}
  async handler(input: z.input<typeof runInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({
      ...(await this.execution.getRun({ ...runInput.parse(input), ...actor })),
    });
  }
}

@Injectable()
export class ListDataMartSchedulesTool implements McpToolDefinition<z.input<typeof martInput>> {
  readonly name = 'list_data_mart_schedules';
  readonly description =
    'List connector load schedules with current MANAGE_TRIGGERS permission: cron, timezone, enabled state, next run and recurring consumption. Existing schedules use default connector loads; schedules use the Data Mart configuration revision; recurring absolute backfill parameters are not supported.';
  readonly zodSchema = martInput.shape;
  readonly outputSchema = {
    dataMartId: z.string(),
    revision: z.number().int().positive(),
    revisionAggregate: z.literal('data-mart-configuration'),
    schedules: z.array(scheduleOutput),
  };
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly execution: McpDataMartExecutionFacade
  ) {}
  async handler(input: z.input<typeof martInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({
      ...(await this.execution.listSchedules({ ...martInput.parse(input), ...actor })),
    });
  }
}

@Injectable()
export class CancelDataMartRunTool implements McpToolDefinition<z.input<typeof runInput>> {
  readonly name = 'cancel_data_mart_run';
  readonly description =
    'Cancel an active connector load under current EDIT permission. For a backfill segment, stop its active segment in the same chain. Repeated calls return already-cancelled when that requested run is cancelled; other terminal states conflict. Completed segments, loaded data and consumption are not rolled back.';
  readonly zodSchema = runInput.shape;
  readonly outputSchema = {
    dataMartId: z.string(),
    requestedRunId: z.string(),
    scope: z.enum(['run', 'backfill-chain']),
    outcome: z.enum(['cancelled', 'already-cancelled']),
    rollback: z.literal(false),
  };
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly execution: McpDataMartExecutionFacade
  ) {}
  async handler(input: z.input<typeof runInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    return jsonToolResult({
      ...(await this.execution.cancelRun({ ...runInput.parse(input), ...actor })),
    });
  }
}

const configurationInput = martInput.extend({
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});
const operationId = z.string().trim().min(1).max(128);
const loadInput = configurationInput
  .extend({
    operationId,
    load: z
      .discriminatedUnion('runType', [
        z.object({ runType: z.literal('INCREMENTAL') }).strict(),
        z
          .object({
            runType: z.literal('MANUAL_BACKFILL'),
            startDate: z.iso.date(),
            endDate: z.iso.date().optional(),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();
const saveScheduleInput = configurationInput
  .extend({
    scheduleId: z.uuid().optional(),
    operationId: operationId.optional(),
    cronExpression: z.string().min(1).max(255),
    timeZone: z.string().min(1).max(255),
    enabled: z.boolean(),
  })
  .strict();
const deleteScheduleInput = configurationInput
  .extend({ scheduleId: z.uuid(), operationId })
  .strict();
const mutationOutput = {
  dataMartId: z.string(),
  resourceId: z.string(),
  revision: z.number().int().nonnegative(),
  revisionAggregate: z.literal('data-mart-configuration'),
  outcome: z.enum(['completed', 'incomplete', 'unknown']),
  runId: z.string().optional(),
  triggerId: z.string().optional(),
  deleted: z.boolean().optional(),
  effect: z.string(),
};

@Injectable()
export class RunDataMartTool implements McpToolDefinition<z.input<typeof loadInput>> {
  readonly name = 'run_data_mart';
  readonly description =
    'Enqueue a published Connector Data Mart load under current EDIT permission and configuration revision. Require explicit user authorization for execution and its possible consumption. Use the same operationId and original input after a lost response: it recovers the same run and trigger without another load. Incremental uses connector defaults; manual backfill preserves date validation and chain segmentation. Enqueued does not mean completed or data ready.';
  readonly zodSchema = loadInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
    idempotentHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly execution: McpDataMartExecutionFacade
  ) {}
  async handler(input: z.input<typeof loadInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    return jsonToolResult({
      ...(await this.execution.runDataMart({ ...loadInput.parse(input), ...actor })),
    });
  }
}

@Injectable()
export class SaveDataMartScheduleTool implements McpToolDefinition<
  z.input<typeof saveScheduleInput>
> {
  readonly name = 'save_data_mart_schedule';
  readonly description =
    'Create or update a connector load schedule under MANAGE_TRIGGERS permission and the current Data Mart configuration revision. Present cron, timezone, enabled state and recurring consumption and require user authorization. New schedules require an operationId for recovery; updates use CAS. Occurrences use current connector default/incremental parameters; recurring absolute backfills are unsupported.';
  readonly zodSchema = saveScheduleInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly execution: McpDataMartExecutionFacade
  ) {}
  async handler(input: z.input<typeof saveScheduleInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    return jsonToolResult({
      ...(await this.execution.saveSchedule({ ...saveScheduleInput.parse(input), ...actor })),
    });
  }
}

@Injectable()
export class DeleteDataMartScheduleTool implements McpToolDefinition<
  z.input<typeof deleteScheduleInput>
> {
  readonly name = 'delete_data_mart_schedule';
  readonly description =
    'Delete the specified connector load schedule under MANAGE_TRIGGERS permission and the current Data Mart configuration revision, after explicit user authorization for this schedule. Reuse operationId and original revision after a lost response. Previously queued runs, loaded data and consumption are preserved.';
  readonly zodSchema = deleteScheduleInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_EXECUTION_FACADE) private readonly execution: McpDataMartExecutionFacade
  ) {}
  async handler(input: z.input<typeof deleteScheduleInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    return jsonToolResult({
      ...(await this.execution.deleteSchedule({ ...deleteScheduleInput.parse(input), ...actor })),
    });
  }
}
