import { z } from 'zod-v4';
import {
  DataMartDefinitionType,
  DataMartStatus,
} from '../../../../../data-marts/facades/mcp-data-mart-setup.facade';

export const definitionType = z.enum(DataMartDefinitionType);
export const dataMartIdInput = z.object({ dataMartId: z.string().min(1).max(255) }).strict();
export const listInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).max(10000).default(0),
    status: z.enum(DataMartStatus).optional(),
  })
  .strict();
export const validationInput = dataMartIdInput
  .extend({ mode: z.enum(['static', 'live']).default('static') })
  .strict();
export const impactInput = dataMartIdInput
  .extend({
    action: z.enum(['definition', 'delete']),
    nextDefinitionType: definitionType.optional(),
    definition: z.lazy(() => definitionInput).optional(),
  })
  .strict();
export const summaryOutput = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    icon: z.string().nullable(),
    status: z.enum(DataMartStatus),
    definitionType: definitionType.nullable(),
    revision: z.number().int().min(1),
    modifiedAt: z.string().datetime(),
    appUrl: z.string().url(),
  })
  .strict();
const relationshipOutput = z
  .object({
    id: z.string(),
    sourceDataMartId: z.string(),
    targetDataMartId: z.string(),
    joinConditions: z.array(
      z.object({ sourceFieldName: z.string(), targetFieldName: z.string() }).strict()
    ),
  })
  .strict();
const scheduleOutput = z
  .object({
    id: z.string(),
    type: z.string(),
    enabled: z.boolean(),
    cronExpression: z.string(),
    timeZone: z.string(),
  })
  .strict();
export const setupOutput = summaryOutput
  .extend({
    connectorPreparationId: z.string().nullable(),
    storage: z.object({ id: z.string(), type: z.string() }).strict(),
    definition: z
      .union([
        z.object({ type: z.literal('SQL'), sqlQuery: z.string() }).strict(),
        z.object({ type: z.enum(['TABLE', 'VIEW']), fullyQualifiedName: z.string() }).strict(),
        z.object({ type: z.literal('TABLE_PATTERN'), pattern: z.string() }).strict(),
        z
          .object({
            type: z.literal('CONNECTOR'),
            connectorName: z.string(),
            node: z.string(),
            fields: z.array(z.string()),
            version: z.number().int().nullable(),
            fullyQualifiedName: z.string(),
            configurationCount: z.number().int(),
            configuration: z.literal('app-managed'),
          })
          .strict(),
      ])
      .nullable(),
    schema: z
      .object({
        freshness: z.enum(['missing', 'current', 'stale']),
        inputRevision: z.number().int().nullable(),
        actualizedAt: z.string().datetime().nullable(),
      })
      .strict(),
    access: z
      .object({
        availableForReporting: z.boolean(),
        availableForMaintenance: z.boolean(),
        technicalOwnerIds: z.array(z.string()),
        businessOwnerIds: z.array(z.string()),
        contextIds: z.array(z.string()),
        canEdit: z.boolean(),
        canDelete: z.boolean(),
        canConfigureSharing: z.boolean(),
        canManageOwners: z.boolean(),
      })
      .strict(),
    relationships: z.array(relationshipOutput),
    restrictedDependencies: z.boolean(),
    schedules: z.array(scheduleOutput),
    reportsCount: z.number().int().min(0),
  })
  .strict();
export const validationOutput = z
  .object({
    dataMartId: z.string(),
    mode: z.enum(['static', 'live']),
    valid: z.boolean(),
    code: z.string().nullable(),
    revision: z.number().int().min(1),
    evaluatedModifiedAt: z.string().datetime(),
    currentness: z.enum(['current', 'changed-during-validation']),
  })
  .strict();
export const impactOutput = z
  .object({
    dataMartId: z.string(),
    action: z.enum(['definition', 'delete']),
    nextDefinitionType: definitionType.nullable(),
    revision: z.number().int().min(1),
    activeConnectorRunsCount: z.number().int().min(0),
    queuedConnectorWorkCount: z.number().int().min(0),
    confirmation: z.literal('impact-digest'),
    impactDigest: z.string(),
    schemaEffect: z.enum(['removed-with-data-mart', 'requires-actualization']),
    credentialEffect: z.enum(['handover-in-use-and-delete-unreferenced', 'unchanged']),
    reportEffect: z.enum(['delete-and-invalidate-cache', 'may-require-repair']),
    scheduleEffect: z.enum(['delete', 'retained']),
    relationships: z.array(relationshipOutput),
    restrictedDependencies: z.boolean(),
    reportsCount: z.number().int().min(0),
    schedules: z.array(scheduleOutput),
    audience: z
      .object({
        availableForReporting: z.boolean(),
        availableForMaintenance: z.boolean(),
        contextIds: z.array(z.string()),
      })
      .strict(),
    legacyExternalDeletion: z.boolean(),
    dropsWarehouseTables: z.literal(false),
  })
  .strict();

export const definitionInput = z.union([
  z.object({ type: z.literal('SQL'), sqlQuery: z.string().min(1).max(1000000) }).strict(),
  z
    .object({ type: z.enum(['TABLE', 'VIEW']), fullyQualifiedName: z.string().min(1).max(2048) })
    .strict(),
  z.object({ type: z.literal('TABLE_PATTERN'), pattern: z.string().min(1).max(2048) }).strict(),
  z
    .object({
      type: z.literal('CONNECTOR'),
      connectorName: z.string().min(1).max(255),
      node: z.string().min(1).max(255),
      fields: z.array(z.string().min(1).max(255)).min(1).max(1000),
      version: z.number().int().positive().optional(),
      fullyQualifiedName: z.string().min(1).max(2048),
      preparationId: z.string().uuid().optional(),
      parameters: z
        .record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()]))
        .optional(),
    })
    .strict(),
]);
const operationId = z.string().trim().min(1).max(255);
const expectedRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const createInput = z
  .object({
    storageId: z.string().min(1).max(255),
    title: z.string().trim().min(1).max(255),
    icon: z.string().max(64).nullable().optional(),
    operationId,
  })
  .strict();
export const definitionMutationInput = dataMartIdInput
  .extend({
    expectedRevision,
    operationId,
    definition: definitionInput,
    impactDigest: z.string().optional(),
  })
  .strict();
export const metadataInput = dataMartIdInput
  .extend({
    expectedRevision,
    operationId,
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(100000).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
  })
  .strict();
export const publishInput = dataMartIdInput.extend({ expectedRevision, operationId }).strict();
export const deleteInput = publishInput
  .extend({ impactDigest: z.string().min(1).max(255) })
  .strict();
export const mutationOutput = z
  .object({
    state: z.enum(['completed', 'incomplete', 'unknown', 'app_action_required']),
    resourceId: z.string(),
    revision: expectedRevision.optional(),
    runId: z.string().optional(),
    triggerId: z.string().optional(),
    deleted: z.boolean().optional(),
    publicationState: z.literal('PUBLISHED').optional(),
    audience: z
      .object({
        configurationRevision: z.number().int().min(1),
        availableForReporting: z.boolean(),
        availableForMaintenance: z.boolean(),
        contextIds: z.array(z.string()),
      })
      .strict()
      .optional(),
    dataReady: z.boolean().optional(),
    appUrl: z.string().url().optional(),
    nextStep: z.string().optional(),
    externalState: z.enum(['completed', 'unknown']).optional(),
  })
  .strict();
