import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  customConnectorCredentialRequirement,
  customConnectorRefusal,
  selectionOf,
  type CustomConnectorCredentialRequirement,
  type CustomConnectorKeyModel,
} from '../../connector-types/custom-connector-credential-fit';
import { customConnectorKeyModel } from '../../connector-types/custom-connector-key-model';
import { isCustomConnectorMetadata } from '../../credentials/credential.types';
import { CredentialService } from '../../credentials/services/credential.service';
import {
  ListFittingCustomConnectorCredentialsCommand,
  type FittingCredentialsQuery,
} from '../../dto/domain/list-fitting-custom-connector-credentials.command';
import type { FittingCustomConnectorCredentialDto } from '../../dto/domain/custom-connector.dto';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { ConnectorDefinitionService } from '../../services/connector/connector-definition.service';
import { ConnectorTestService } from '../../services/connector/connector-test.service';

/** The enabled custom connector Credentials the member can use that fit a manifest, without values. */
@Injectable()
export class ListFittingCustomConnectorCredentialsService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly access: AccessDecisionService,
    private readonly definitions: ConnectorDefinitionService,
    private readonly tests: ConnectorTestService
  ) {}

  async run(
    command: ListFittingCustomConnectorCredentialsCommand
  ): Promise<FittingCustomConnectorCredentialDto[]> {
    const { projectId, userId, roles, query } = command;
    const { model, selection } = await this.keyModelOf(projectId, query);
    const fitting = (await this.credentials.listEnabledCustomConnectorPublic(projectId)).flatMap(
      credential => {
        const metadata = credential.publicMetadata ?? null;
        return customConnectorRefusal(
          model,
          { definitionId: credential.definitionId, publicMetadata: metadata },
          selection
        ) === null && isCustomConnectorMetadata(metadata)
          ? [{ credential, metadata }]
          : [];
      }
    );
    const canUse = await this.access.canAccessMany(
      userId,
      roles,
      EntityType.CREDENTIAL,
      fitting.map(({ credential }) => credential.id),
      Action.USE,
      projectId
    );
    return fitting
      .filter(({ credential }) => canUse.get(credential.id) === true)
      .map(({ credential, metadata }) => ({
        id: credential.id,
        title: credential.title,
        hosts: [...metadata.hosts],
        fieldKeys: metadata.fieldList.map(field => field.key),
      }));
  }

  /** What a new Credential must hold to fit the same manifest, so that it is listed here. */
  async requirement(
    command: ListFittingCustomConnectorCredentialsCommand
  ): Promise<CustomConnectorCredentialRequirement> {
    const { model, selection } = await this.keyModelOf(command.projectId, command.query);
    return customConnectorCredentialRequirement(model, selection);
  }

  /** The model and the branch it runs: the selection sent is the configuration's value. */
  private async keyModelOf(
    projectId: string,
    query: FittingCredentialsQuery
  ): Promise<{ model: CustomConnectorKeyModel; selection: string | undefined }> {
    const manifest = await this.manifestOf(projectId, query);
    const model = customConnectorKeyModel(
      query.node ? this.tests.pruneToNode(manifest, query.node) : manifest
    );
    const name = model.authentication?.selectionParameter;
    return { model, selection: selectionOf(model, name ? { [name]: query.selection } : {}) };
  }

  /** The manifest sent, or the one a run of the named connector would use. */
  private async manifestOf(
    projectId: string,
    { manifest, connectorName, version }: FittingCredentialsQuery
  ): Promise<Record<string, unknown>> {
    if (!manifest === !connectorName) {
      throw new BadRequestException('Send either a manifest or a connectorName.');
    }
    if (manifest) return manifest;
    const resolved = await this.definitions.tryResolveManifest(
      projectId,
      connectorName!,
      version ?? undefined
    );
    if (!resolved) throw new NotFoundException(`Custom connector '${connectorName}' not found`);
    return resolved;
  }
}
