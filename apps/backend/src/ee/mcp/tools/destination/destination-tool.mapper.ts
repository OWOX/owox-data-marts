import type { AuthorizationContext } from '../../../../idp';
import { extractDriveFolderId } from '../../../../data-marts/data-destination-types/google-sheets/utils/drive-folder-url.utils';
import { z } from 'zod';
import type {
  McpDestinationDto,
  McpDestinationMutationResponse,
} from '../../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DESTINATION_TYPES } from '../../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { buildDataDestinationsUiPath } from '../data-mart-ui-path';
import { joinPublicOrigin } from '../mcp-public-url.util';

export const destinationIdInput = z.object({ destination_id: z.string().min(1) }).strict();
export const driveFolderUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(value => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'drive.google.com' &&
      extractDriveFolderId(value) !== null
    );
  }, 'Use a Google Drive folder URL.');

export const destinationSummaryOutput = {
  id: z.string(),
  url: z.string(),
  name: z.string(),
  type: z.enum(MCP_DESTINATION_TYPES),
  owner: z
    .string()
    .nullable()
    .describe(
      'Email of the member who created this Destination. Use owners for current ownership.'
    ),
  connectedGoogleAccount: z.string().nullable(),
  createdAt: z.string(),
  owners: z.array(
    z.object({ user_id: z.string(), name: z.string().nullable(), email: z.string().nullable() })
  ),
  contexts: z.array(
    z.object({ context_id: z.string(), name: z.string(), icon: z.string().nullable() })
  ),
  available_for_use: z.boolean().nullable(),
  available_for_maintenance: z.boolean().nullable(),
  credential: z
    .object({
      access: z.enum(['visible', 'restricted', 'pending']),
      state: z.enum([
        'ready',
        'disabled',
        'not-configured',
        'reconnect-required',
        'reauthorize-required',
        'deleted',
        'unavailable',
      ]),
      credential_id: z.string().optional(),
      title: z.string().optional(),
      definition_id: z.string().optional(),
      provider_name: z.string().optional(),
      identity: z.string().nullable().optional(),
    })
    .nullable(),
};

export const destinationDetailsOutput = z
  .object(destinationSummaryOutput)
  .omit({ id: true, connectedGoogleAccount: true, createdAt: true })
  .extend({
    destination_id: destinationSummaryOutput.id,
    connected_google_account: destinationSummaryOutput.connectedGoogleAccount,
    created_at: destinationSummaryOutput.createdAt,
    emails: z.array(z.string()).nullable(),
    drive_folder_url: z.string().nullable(),
  }).shape;

export const destinationMutationOutput = {
  destination_id: z.string(),
  status: z.enum(['updated', 'deleted', 'rotated']),
  destination_url: z.string(),
};

export class DestinationToolMapper {
  toActor(context: McpAuthContext): AuthorizationContext {
    return { projectId: context.projectId, userId: context.userId, roles: context.roles };
  }

  toSummary(dto: McpDestinationDto, projectId: string, publicOrigin: string) {
    const credential = dto.credential;
    return {
      id: dto.id,
      url: this.toUrl(dto.id, projectId, publicOrigin),
      name: dto.name,
      type: dto.type,
      owner: dto.owner,
      connectedGoogleAccount: dto.connectedGoogleAccount,
      createdAt: dto.createdAt,
      owners: dto.owners.map(owner => ({
        user_id: owner.userId,
        name: owner.name,
        email: owner.email,
      })),
      contexts: dto.contexts.map(context => ({
        context_id: context.id,
        name: context.name,
        icon: context.icon,
      })),
      available_for_use: dto.availableForUse,
      available_for_maintenance: dto.availableForMaintenance,
      credential: credential
        ? {
            access: credential.access,
            state: credential.state,
            ...(credential.access === 'visible' && {
              credential_id: credential.id,
              title: credential.title,
              provider_name: credential.providerName,
            }),
            ...(credential.definitionId !== undefined && {
              definition_id: credential.definitionId,
            }),
            ...(credential.identity !== undefined && { identity: credential.identity }),
          }
        : null,
    };
  }

  toDetails(dto: McpDestinationDto, projectId: string, publicOrigin: string) {
    const { id, connectedGoogleAccount, createdAt, ...summary } = this.toSummary(
      dto,
      projectId,
      publicOrigin
    );
    return {
      ...summary,
      destination_id: id,
      connected_google_account: connectedGoogleAccount,
      created_at: createdAt,
      emails: dto.emails,
      drive_folder_url: dto.folderUrl,
    };
  }

  toMutation(dto: McpDestinationMutationResponse, projectId: string, publicOrigin: string) {
    return {
      destination_id: dto.id,
      status: dto.status,
      destination_url: this.toUrl(dto.id, projectId, publicOrigin),
    };
  }

  private toUrl(id: string, projectId: string, publicOrigin: string): string {
    return joinPublicOrigin(publicOrigin, buildDataDestinationsUiPath(projectId, id));
  }
}
