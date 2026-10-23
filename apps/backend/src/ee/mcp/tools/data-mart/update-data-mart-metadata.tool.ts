import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import {
  dataMartTargetShape,
  dataMartConfigurationOutput,
  dataMartIconSchema,
} from './data-mart-configuration.schemas';

const inputSchema = z
  .object({
    ...dataMartTargetShape,
    title: z
      .string()
      .min(1)
      .optional()
      .describe('New non-empty Data Mart title. Omit to preserve it; null is not allowed.'),
    description: z
      .string()
      .min(1)
      .refine(
        value => Buffer.byteLength(value, 'utf8') <= 65535,
        'Description must fit within 65535 UTF-8 bytes'
      )
      .nullable()
      .optional()
      .describe(
        'New business description, containing at least one character and at most 65,535 UTF-8 bytes. Omit to preserve it or pass null to clear it.'
      ),
    icon: dataMartIconSchema
      .nullable()
      .optional()
      .describe(
        'Built-in icon key or lucide:<kebab-case-name>. Omit to preserve it or pass null to restore the default icon.'
      ),
  })
  .strict()
  .refine(
    input =>
      input.title !== undefined || input.description !== undefined || input.icon !== undefined,
    'Provide at least one of title, description or icon'
  );
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDataMartMetadataTool implements McpToolDefinition<Input> {
  readonly name = 'update_data_mart_metadata';
  readonly description =
    'Update the title, business description and/or icon of a draft or published Data Mart in the connected project. Supply at least one metadata field. Omitted fields are preserved; null clears description or resets icon, but title must be a non-empty string. Requires editor or admin and permission to edit the Data Mart. Updates are not atomic: if a call fails, read get_data_mart_configuration before retrying.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = dataMartConfigurationOutput;
  readonly annotations = {
    title: 'Update Data Mart Metadata',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const { data_mart_id, ...properties } = this.parseInput(input);
    const result = await this.facade.updateDataMartMetadata(
      { projectId: context.projectId, userId: context.userId, roles: context.roles },
      { dataMartId: data_mart_id, ...properties }
    );
    return jsonToolResult({ data_mart: result });
  }
}
