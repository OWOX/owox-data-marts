import { BadRequestException } from '@nestjs/common';
import type { McpCustomConnectorsFacade } from '../../../../data-marts/facades/mcp-custom-connectors.facade';
import { mcpSecretParameterNames } from '../../observability/mcp-telemetry-redaction';

/** The newest draft of a connector, for a test whose configuration holds no keys. */
export async function loadDraftForTest(
  connectors: McpCustomConnectorsFacade,
  projectId: string,
  input: { connector_id: string; node: string; configuration: Record<string, unknown> }
): Promise<Record<string, unknown>> {
  // The draft is saved data, so the request definition is never a tool argument.
  const { versions } = await connectors.get(projectId, input.connector_id);
  // Publish takes the newest draft, so the test does too.
  const draft = versions.findLast(version => version.status === 'draft');
  if (!draft) {
    throw new BadRequestException(
      'This connector has no draft. Save one with save_custom_connector_draft, then test it.'
    );
  }
  const { manifest } = await connectors.getVersion(projectId, input.connector_id, draft.version);
  // Keys typed here pass through the AI client to its provider; only a saved Credential carries them.
  const secretNames = mcpSecretParameterNames(
    { manifest, configuration: input.configuration },
    input.node
  );
  const keys = Object.keys(input.configuration).filter(name => secretNames.has(name));
  if (keys.length > 0) {
    throw new BadRequestException(
      `Remove ${keys.join(', ')} from configuration. This tool does not accept keys. ` +
        'Select a saved Credential with credential_id. A Credential supplies only the parameters that the draft marks with attributes: ["SECRET"] or uses in authentication, so mark any other key parameter SECRET and save the draft. ' +
        'To save keys in a new Credential, call start_credential_setup with connector_id.'
    );
  }
  return manifest;
}
