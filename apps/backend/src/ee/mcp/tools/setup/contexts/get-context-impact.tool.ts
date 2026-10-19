import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod-v4';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_CONTEXT_SETUP_FACADE,
  type McpContextSetupFacade,
} from '../../../../../data-marts/facades/mcp-context-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import { contextIdInput } from './context-setup.schemas';
import { contextChange } from './context-mutation.schemas';
const inputSchema = z
  .object({
    contextId: contextIdInput.shape.contextId.optional(),
    change: contextChange.optional(),
  })
  .strict()
  .refine(
    value => Boolean(value.contextId) !== Boolean(value.change),
    'Provide either contextId or change'
  );

@Injectable()
export class GetContextImpactTool implements McpToolDefinition<z.input<typeof inputSchema>> {
  readonly name = 'get_context_impact';
  readonly description =
    'Admin-only deletion impact: all four resource types, member assignments, provisioning defaults and members losing their last Context. Shows required explicit detach/reassignment actions. Returns a revision-bound delete impact digest. Express user authorization remains required.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    changeImpact: z
      .object({
        revision: z.number().int().nonnegative(),
        revisionAggregate: z.literal('project_context_configuration'),
        action: z.string(),
        target: z.string(),
        impactDigest: z.string(),
        change: contextChange,
        effects: z
          .object({
            defaultRole: z.string().nullable(),
            currentContextIds: z.array(z.string()),
            proposedContextIds: z.array(z.string()),
            currentMemberIds: z.array(z.string()),
            proposedMemberIds: z.array(z.string()),
            affectedMemberIds: z.array(z.string()),
            currentScope: z.enum(['entire_project', 'selected_contexts']).nullable(),
            proposedScope: z.enum(['entire_project', 'selected_contexts']).nullable(),
            blockers: z
              .object({
                dataMartCount: z.number(),
                storageCount: z.number(),
                destinationCount: z.number(),
                credentialCount: z.number(),
                memberCount: z.number(),
                userProvisioningDefaultsCount: z.number(),
              })
              .strict(),
          })
          .strict(),
      })
      .strict()
      .optional(),
    impact: z
      .object({
        contextId: z.string(),
        impactDigest: z.string(),
        revision: z.number().int().nonnegative(),
        revisionAggregate: z.literal('project_context_configuration'),
        blockers: z
          .object({
            dataMartCount: z.number().int().nonnegative(),
            storageCount: z.number().int().nonnegative(),
            destinationCount: z.number().int().nonnegative(),
            credentialCount: z.number().int().nonnegative(),
            memberCount: z.number().int().nonnegative(),
            userProvisioningDefaultsCount: z.number().int().nonnegative(),
          })
          .strict(),
        affectedMemberIds: z.array(z.string()),
        detached: z.boolean(),
        requiredActions: z.array(z.string()),
      })
      .strict()
      .optional(),
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CONTEXT_SETUP_FACADE) private readonly contexts: McpContextSetupFacade
  ) {}
  async handler(input: z.input<typeof inputSchema>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = inputSchema.parse(input);
    if (parsed.change)
      return jsonToolResult({
        changeImpact: await this.contexts.getChangeImpact(actor, parsed.change as never),
      });
    if (!parsed.contextId) throw new Error('Provide contextId or change');
    return jsonToolResult({ impact: await this.contexts.getImpact(actor, parsed.contextId) });
  }
}
