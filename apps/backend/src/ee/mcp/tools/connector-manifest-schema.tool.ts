import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { MANIFEST_SCHEMA_REFERENCE, MANIFEST_SCHEMA_VERSION } from './manifest-schema.reference';

const inputSchema = z.object({}).strict();
type GetManifestSchemaInput = z.infer<typeof inputSchema>;

@Injectable()
export class ConnectorManifestSchemaTool implements McpToolDefinition<GetManifestSchemaInput> {
  readonly name = 'connector_manifest_schema';
  readonly description =
    'Return the complete reference for authoring an OWOX no-code declarative connector manifest — the full grammar, every accepted enum value, the mistakes that make the parser reject a manifest, and copy-pasteable worked examples. CALL THIS FIRST, before writing or editing a manifest by hand. Typical flow: connector_manifest_schema (learn the grammar) → author the manifest JSON → connector_test (dry-run one node using non-secret config only — never API keys or tokens; credentials are entered via the browser) → fix from the returned error → connector_publish. Auth types: apiKey, bearer, basic, tokenExchange, oauth2, selective. Pagination: none, offset, page, cursor. Incremental: none, day-by-day, range. Field types: string, integer, number, boolean, date, datetime, object, array. Gotchas: the auth block is "authentication" (not "auth"); the query string is "queryParameters" (not "queryParams"); the record path is "recordSelector.recordPath" (an array, not "fieldPath"); "fields" is an object keyed by field name, not an array.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    reference_markdown: z.string(),
    version: z.string(),
  };
  readonly annotations = {
    title: 'Connector Manifest Schema',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  parseInput(input: unknown): GetManifestSchemaInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetManifestSchemaInput, _context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);
    return jsonToolResult({
      reference_markdown: MANIFEST_SCHEMA_REFERENCE,
      version: MANIFEST_SCHEMA_VERSION,
    });
  }
}
