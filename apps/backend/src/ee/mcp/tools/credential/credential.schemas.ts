import { maxLength } from 'class-validator';
import { z } from 'zod';

const idSchema = z.string().trim().min(1).max(255);
const modelIdSchema = z.string().trim().min(1);
const titleSchema = z
  .string()
  .trim()
  .min(1)
  .refine(value => maxLength(value, 255), 'Title must not exceed 255 characters');
const modelMappingsSchema = z
  .object({
    fast: modelIdSchema.optional(),
    reasoning: modelIdSchema.optional(),
    embedding: modelIdSchema.optional(),
    decision: modelIdSchema.optional(),
  })
  .strict();
const modelModeSchema = z.enum(['recommended', 'override']);
const modelMappingModesSchema = z
  .object({
    fast: modelModeSchema.optional(),
    reasoning: modelModeSchema.optional(),
    embedding: modelModeSchema.optional(),
    decision: modelModeSchema.optional(),
  })
  .strict();

export const noCredentialInputSchema = z.object({}).strict();
export const credentialTargetSchema = z.object({ credential_id: idSchema }).strict();
export const updateCredentialSchema = credentialTargetSchema
  .extend({
    title: titleSchema.optional(),
    owner_ids: z.array(idSchema).min(1).max(100).optional(),
    context_ids: z.array(idSchema).max(100).optional(),
    enabled: z.boolean().optional(),
    available_for_use: z.boolean().optional(),
    available_for_maintenance: z.boolean().optional(),
    ai_model_mappings: modelMappingsSchema.nullable().optional(),
    ai_model_mapping_modes: modelMappingModesSchema.nullable().optional(),
  })
  .strict()
  .refine(
    input => Object.keys(input).some(key => key !== 'credential_id'),
    'Supply at least one metadata, access, or AI mapping field'
  );

export const startCredentialSetupSchema = z
  .object({
    definition_id: idSchema
      .optional()
      .describe(
        'For a new Credential, copy a compatible ID from list_credential_definitions. Always supply it for a known Storage or Destination and match the authentication method. Omit it when updating an existing Credential, or for an explicit provider-picker request without a known target.'
      ),
    credential_id: idSchema
      .optional()
      .describe('Existing Credential to update or reconnect. Do not combine with definition_id.'),
    title: titleSchema.optional(),
    connector_id: idSchema
      .optional()
      .describe(
        'For a new custom connector Credential: the custom connector it is for. The form opens with the hosts and key fields of its draft, else of its active version. Implies definition_id custom-connector.'
      ),
  })
  .strict()
  .refine(
    input => !(input.definition_id && input.credential_id),
    'Supply definition_id or credential_id, not both'
  )
  .refine(
    input => !(input.credential_id && input.title !== undefined),
    'Use title only when creating a Credential'
  )
  .refine(
    input =>
      !input.connector_id ||
      (!input.credential_id && (input.definition_id ?? 'custom-connector') === 'custom-connector'),
    'Use connector_id only to create a custom-connector Credential'
  );

export const credentialSetupStatusSchema = z
  .object({
    setup_id: idSchema,
    wait_seconds: z.number().int().min(0).max(25).optional(),
  })
  .strict();

export const credentialDefinitionOutputSchema = z.object({
  definition_id: z.string(),
  source: z.enum(['builtin', 'external']),
  display_name: z.string(),
  description: z.string(),
  documentation_url: z.string().nullable(),
  category: z.string(),
  connectors: z.array(z.string()),
  storage_types: z.array(z.string()),
  destination_types: z.array(z.string()),
  auth_type: z.enum(['header', 'google-service-account', 'fields', 'oauth', 'custom-connector']),
  supports_ai: z.boolean(),
  compatibility_line: z.string().nullable(),
});

export const credentialOutputSchema = {
  credential_id: z.string(),
  title: z.string(),
  definition: credentialDefinitionOutputSchema,
  definition_consent_required: z.boolean(),
  enabled: z.boolean(),
  available_for_use: z.boolean(),
  available_for_maintenance: z.boolean(),
  validation_state: z.enum(['unknown', 'verified', 'rejected']),
  validated_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  ai_model_mappings: z
    .object({
      fast: z.string().optional(),
      reasoning: z.string().optional(),
      embedding: z.string().optional(),
      decision: z.string().optional(),
    })
    .nullable(),
  ai_model_mapping_modes: modelMappingModesSchema.nullable(),
  can_use: z.boolean(),
  owner_ids: z.array(z.string()),
  context_ids: z.array(z.string()),
  used_by: z.array(
    z.object({
      consumer_type: z.string(),
      consumer_id: z.string(),
      title: z.string(),
      requirement_key: z.string(),
      last_used_at: z.string().nullable(),
    })
  ),
  hidden_consumer_count: z.number().int().nonnegative(),
  created_at: z.string(),
  modified_at: z.string(),
};

export const credentialListItemSchema = z.union([
  z.object(credentialOutputSchema),
  z.object({
    credential_id: z.string(),
    title: z.string(),
    definition_id: z.string(),
    state: z.literal('unavailable'),
    created_at: z.string(),
    modified_at: z.string(),
  }),
]);

export const credentialSetupOutputSchema = {
  setup_id: z.string(),
  mode: z.enum(['create', 'update']),
  status: z.enum(['pending', 'completed', 'cancelled', 'expired']),
  definition_id: z.string().nullable(),
  credential_id: z.string().nullable(),
  created_at: z.string(),
  expires_at: z.string(),
  completed_at: z.string().nullable(),
};
