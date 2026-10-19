import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
} from '../../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import { previewInput, previewOutput } from './preview-data-mart.schemas';

@Injectable()
export class PreviewDataMartTool implements McpToolDefinition<z.input<typeof previewInput>> {
  readonly name = 'preview_data_mart';
  readonly description =
    'Read bounded setup rows from a saved draft or published Data Mart, including existing connector output. Default 10/max 1000 rows and 256 KiB output. Uses current access and license gates; warehouse charges apply. No Report run or OWOX consumption. SQL preview may refresh the technical warehouse view. Returns the starting configuration revision and schema binding. Currentness remains observational: shared SQL views and warehouse data can change during preview.';
  readonly zodSchema = previewInput.shape;
  readonly outputSchema = previewOutput.shape;
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade
  ) {}

  async handler(
    input: z.input<typeof previewInput>,
    context: McpAuthContext,
    signal?: AbortSignal
  ) {
    const actor = await this.authorization.authorize(context, 'live');
    const request = previewInput.parse(input);
    const result = await this.model.preview({ ...request, ...actor }, signal);
    return jsonToolResult({ ...previewOutput.parse(result) });
  }
}
