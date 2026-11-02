import { Injectable } from '@nestjs/common';
import { ListCustomConnectorsCommand } from '../dto/domain/list-custom-connectors.command';
import { GetCustomConnectorCommand } from '../dto/domain/get-custom-connector.command';
import { CreateCustomConnectorCommand } from '../dto/domain/create-custom-connector.command';
import { UpdateCustomConnectorMetadataCommand } from '../dto/domain/update-custom-connector-metadata.command';
import { GetCustomConnectorVersionCommand } from '../dto/domain/get-custom-connector-version.command';
import { SaveCustomConnectorDraftCommand } from '../dto/domain/save-custom-connector-draft.command';
import { PublishCustomConnectorCommand } from '../dto/domain/publish-custom-connector.command';
import { ActivateCustomConnectorVersionCommand } from '../dto/domain/activate-custom-connector-version.command';
import { DeleteCustomConnectorCommand } from '../dto/domain/delete-custom-connector.command';
import { GetCustomConnectorSpecificationCommand } from '../dto/domain/get-custom-connector-specification.command';
import { GetCustomConnectorFieldsCommand } from '../dto/domain/get-custom-connector-fields.command';
import {
  ListFittingCustomConnectorCredentialsCommand,
  type FittingCredentialsQuery,
} from '../dto/domain/list-fitting-custom-connector-credentials.command';
import type { CustomConnectorCredentialRequirement } from '../connector-types/custom-connector-credential-fit';
import { TestCustomConnectorCommand } from '../dto/domain/test-custom-connector.command';
import type {
  CustomConnectorActor,
  CreateCustomConnectorInput,
  CustomConnectorMetadataInput,
  CustomConnectorTestInput,
  CustomConnectorTestResultDto,
  CustomConnectorActivatedDto,
  CustomConnectorCreatedDto,
  CustomConnectorDetailDto,
  CustomConnectorDto,
  CustomConnectorVersionDto,
  CustomConnectorVersionStateDto,
  FittingCustomConnectorCredentialDto,
  CustomConnectorPublishedDto,
} from '../dto/domain/custom-connector.dto';
import type {
  CustomConnectorListItemResponseApiDto,
  CustomConnectorDetailResponseApiDto,
  CreateCustomConnectorResponseApiDto,
  CustomConnectorVersionResponseApiDto,
  CustomConnectorVersionStateResponseApiDto,
  PublishCustomConnectorResponseApiDto,
  ActivateCustomConnectorVersionResponseApiDto,
  ConnectorTestResultResponseApiDto,
  CustomConnectorCredentialRequirementResponseApiDto,
  FittingCustomConnectorCredentialResponseApiDto,
} from '../dto/presentation/custom-connector-response.dto';
import { ConnectorDefinition } from '../entities/connector-definition.entity';
import { ConnectorDefinitionVersion } from '../entities/connector-definition-version.entity';
import {
  ConnectorDefinitionVersionSummary,
  StoppingDataMarts,
} from '../services/connector/connector-definition.service';

// Explicit domain projections keep persistence-only fields and manifests out of metadata reads.
@Injectable()
export class ConnectorDefinitionMapper {
  toListCommand(projectId: string): ListCustomConnectorsCommand {
    return new ListCustomConnectorsCommand(projectId);
  }

  toGetCommand(projectId: string, connectorId: string): GetCustomConnectorCommand {
    return new GetCustomConnectorCommand(projectId, connectorId);
  }

  toCreateCommand(
    actor: CustomConnectorActor,
    input: CreateCustomConnectorInput
  ): CreateCustomConnectorCommand {
    return new CreateCustomConnectorCommand(actor.projectId, actor.userId, {
      name: input.name,
      title: input.title,
      description: input.description ?? null,
      logo: input.logo ?? null,
      docUrl: input.docUrl ?? null,
      manifest: input.manifest,
    });
  }

  toUpdateMetadataCommand(
    projectId: string,
    connectorId: string,
    input: CustomConnectorMetadataInput
  ): UpdateCustomConnectorMetadataCommand {
    return new UpdateCustomConnectorMetadataCommand(projectId, connectorId, input);
  }

  toGetVersionCommand(
    projectId: string,
    connectorId: string,
    version: number
  ): GetCustomConnectorVersionCommand {
    return new GetCustomConnectorVersionCommand(projectId, connectorId, version);
  }

  toSaveDraftCommand(
    projectId: string,
    connectorId: string,
    manifest: Record<string, unknown>
  ): SaveCustomConnectorDraftCommand {
    return new SaveCustomConnectorDraftCommand(projectId, connectorId, manifest);
  }

  toPublishCommand(
    actor: CustomConnectorActor,
    connectorId: string
  ): PublishCustomConnectorCommand {
    return new PublishCustomConnectorCommand(
      actor.projectId,
      connectorId,
      actor.userId,
      actor.roles ?? []
    );
  }

  toActivateCommand(
    actor: CustomConnectorActor,
    connectorId: string,
    version: number
  ): ActivateCustomConnectorVersionCommand {
    return new ActivateCustomConnectorVersionCommand(
      actor.projectId,
      connectorId,
      version,
      actor.userId,
      actor.roles ?? []
    );
  }

  toDeleteCommand(projectId: string, connectorId: string): DeleteCustomConnectorCommand {
    return new DeleteCustomConnectorCommand(projectId, connectorId);
  }

  toSpecificationCommand(
    projectId: string,
    connectorId: string,
    version?: number
  ): GetCustomConnectorSpecificationCommand {
    return new GetCustomConnectorSpecificationCommand(projectId, connectorId, version);
  }

  toFieldsCommand(
    projectId: string,
    connectorId: string,
    version?: number
  ): GetCustomConnectorFieldsCommand {
    return new GetCustomConnectorFieldsCommand(projectId, connectorId, version);
  }

  /** Without `caller.credentialId` the test runs on the typed values, as MCP tests do. */
  toTestCommand(
    projectId: string,
    input: CustomConnectorTestInput,
    caller?: { credentialId?: string; userId: string; roles?: string[] }
  ): TestCustomConnectorCommand {
    return new TestCustomConnectorCommand(
      projectId,
      {
        manifest: input.manifest,
        node: input.node,
        configuration: input.configuration,
        maxRows: input.maxRows,
        maxPages: input.maxPages,
      },
      caller?.credentialId
        ? { credentialId: caller.credentialId, userId: caller.userId, roles: caller.roles ?? [] }
        : undefined
    );
  }

  toListItemDto(def: ConnectorDefinition, activeVersion: number | null): CustomConnectorDto {
    return {
      id: def.id,
      name: def.name,
      title: def.title,
      description: def.description ?? null,
      logo: def.logo ?? null,
      docUrl: def.docUrl ?? null,
      activeVersionId: def.activeVersionId ?? null,
      activeVersion,
    };
  }

  toListDto(
    defs: ConnectorDefinition[],
    activeVersionByDefId: Map<string, number>
  ): CustomConnectorDto[] {
    return defs.map(def => this.toListItemDto(def, activeVersionByDefId.get(def.id) ?? null));
  }

  toDetailDto(
    def: ConnectorDefinition,
    versions: ConnectorDefinitionVersionSummary[],
    activeVersion: number | null
  ): CustomConnectorDetailDto {
    return {
      ...this.toListItemDto(def, activeVersion),
      versions: versions.map(v => ({
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt ?? null,
      })),
    };
  }

  toCreatedDto(def: ConnectorDefinition): CustomConnectorCreatedDto {
    return { id: def.id, name: def.name, title: def.title };
  }

  toVersionDto(row: ConnectorDefinitionVersion): CustomConnectorVersionDto {
    return { version: row.version, status: row.status, manifest: row.manifest };
  }

  toVersionStateDto(row: ConnectorDefinitionVersion): CustomConnectorVersionStateDto {
    return { version: row.version, status: row.status };
  }

  toPublishedDto(
    row: ConnectorDefinitionVersion,
    warnings: string[],
    stopping: StoppingDataMarts
  ): CustomConnectorPublishedDto {
    return {
      version: row.version,
      status: row.status,
      publishedAt: row.publishedAt,
      warnings,
      ...stopping,
    };
  }

  toActivatedDto(
    def: ConnectorDefinition,
    version: number,
    stopping: StoppingDataMarts
  ): CustomConnectorActivatedDto {
    return { activeVersionId: def.activeVersionId ?? null, activeVersion: version, ...stopping };
  }

  toListItemApiResponse(dto: CustomConnectorDto): CustomConnectorListItemResponseApiDto {
    return {
      id: dto.id,
      name: dto.name,
      title: dto.title,
      description: dto.description,
      logo: dto.logo,
      docUrl: dto.docUrl,
      activeVersionId: dto.activeVersionId,
      activeVersion: dto.activeVersion,
    };
  }

  toListApiResponse(dtos: CustomConnectorDto[]): CustomConnectorListItemResponseApiDto[] {
    return dtos.map(dto => this.toListItemApiResponse(dto));
  }

  toDetailApiResponse(dto: CustomConnectorDetailDto): CustomConnectorDetailResponseApiDto {
    return {
      ...this.toListItemApiResponse(dto),
      versions: dto.versions.map(version => ({
        version: version.version,
        status: version.status,
        publishedAt: version.publishedAt,
      })),
    };
  }

  toCreatedApiResponse(dto: CustomConnectorCreatedDto): CreateCustomConnectorResponseApiDto {
    return { id: dto.id, name: dto.name, title: dto.title };
  }

  toVersionApiResponse(dto: CustomConnectorVersionDto): CustomConnectorVersionResponseApiDto {
    return { version: dto.version, status: dto.status, manifest: dto.manifest };
  }

  toVersionStateApiResponse(
    dto: CustomConnectorVersionStateDto
  ): CustomConnectorVersionStateResponseApiDto {
    return { version: dto.version, status: dto.status };
  }

  toPublishedApiResponse(dto: CustomConnectorPublishedDto): PublishCustomConnectorResponseApiDto {
    return {
      version: dto.version,
      status: dto.status,
      publishedAt: dto.publishedAt,
      warnings: dto.warnings,
      stoppingDataMarts: dto.stoppingDataMarts,
      hiddenStoppingCount: dto.hiddenStoppingCount,
    };
  }

  toActivatedApiResponse(
    dto: CustomConnectorActivatedDto
  ): ActivateCustomConnectorVersionResponseApiDto {
    return {
      activeVersionId: dto.activeVersionId,
      activeVersion: dto.activeVersion,
      stoppingDataMarts: dto.stoppingDataMarts,
      hiddenStoppingCount: dto.hiddenStoppingCount,
    };
  }

  toTestApiResponse(dto: CustomConnectorTestResultDto): ConnectorTestResultResponseApiDto {
    return { rows: dto.rows, logs: dto.logs, error: dto.error, sample: dto.sample };
  }

  toFittingCredentialsCommand(
    caller: { projectId: string; userId: string; roles?: string[] },
    body: FittingCredentialsQuery
  ): ListFittingCustomConnectorCredentialsCommand {
    return new ListFittingCustomConnectorCredentialsCommand(
      caller.projectId,
      caller.userId,
      caller.roles ?? [],
      {
        manifest: body.manifest,
        connectorName: body.connectorName,
        version: body.version,
        node: body.node,
        selection: body.selection,
      }
    );
  }

  toFittingCredentialsApiResponse(
    items: FittingCustomConnectorCredentialDto[]
  ): FittingCustomConnectorCredentialResponseApiDto[] {
    return items.map(({ id, title, hosts, fieldKeys, refusal }) => ({
      id,
      title,
      hosts,
      fieldKeys,
      refusal,
    }));
  }

  toCredentialRequirementApiResponse(
    requirement: CustomConnectorCredentialRequirement
  ): CustomConnectorCredentialRequirementResponseApiDto {
    return {
      hosts: requirement.hosts,
      fieldList: requirement.fieldList.map(({ key, label, secret, required }) => ({
        key,
        label,
        secret,
        required,
      })),
      keyParameters: requirement.keyParameters,
      selectionParameter: requirement.selectionParameter,
      misuse: requirement.misuse,
    };
  }
}
