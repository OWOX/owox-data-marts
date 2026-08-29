import { Injectable } from '@nestjs/common';
import {
  ActivateCustomConnectorVersionResponseApiDto,
  CreateCustomConnectorResponseApiDto,
  CustomConnectorDetailResponseApiDto,
  CustomConnectorListItemResponseApiDto,
  CustomConnectorVersionResponseApiDto,
  CustomConnectorVersionStateResponseApiDto,
  PublishCustomConnectorResponseApiDto,
} from '../dto/presentation/custom-connector-response.dto';
import { ConnectorDefinition } from '../entities/connector-definition.entity';
import { ConnectorDefinitionVersion } from '../entities/connector-definition-version.entity';
import { ConnectorDefinitionVersionSummary } from '../services/connector/connector-definition.service';

/**
 * The entity -> API boundary for ConnectorDefinitionController.
 *
 * Every handler used to build its response literal inline, which put the mapping in the
 * one layer that is not unit-tested and gave a TypeORM entity a direct path to the wire:
 * spreading a row, or adding a column and forgetting that the literal names its fields
 * explicitly, is how `projectId`, `createdById` or a raw `manifest` leak. Naming each
 * projection here is also what makes the field list reviewable next to the DTO that
 * documents it -- notably that a list row deliberately carries version METADATA and no
 * manifest, the split ConnectorDefinitionController's @Auth levels rest on.
 *
 * Pure and I/O-free, per the module's mapper convention: anything a projection needs that
 * is not on the entity (the active version NUMBER, which costs a query) is resolved by the
 * controller's use case and passed in.
 */
@Injectable()
export class ConnectorDefinitionMapper {
  /**
   * `activeVersion` is passed in rather than read from the definition because the entity
   * stores only `activeVersionId`; resolving the number is a query, and the list page
   * makes it ONCE for the whole page (see the controller's `list`).
   */
  toListItemResponse(
    def: ConnectorDefinition,
    activeVersion: number | null
  ): CustomConnectorListItemResponseApiDto {
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

  toListResponse(
    defs: ConnectorDefinition[],
    activeVersionByDefId: Map<string, number>
  ): CustomConnectorListItemResponseApiDto[] {
    return defs.map(def => this.toListItemResponse(def, activeVersionByDefId.get(def.id) ?? null));
  }

  toDetailResponse(
    def: ConnectorDefinition,
    versions: ConnectorDefinitionVersionSummary[],
    activeVersion: number | null
  ): CustomConnectorDetailResponseApiDto {
    return {
      ...this.toListItemResponse(def, activeVersion),
      versions: versions.map(v => ({
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt ?? null,
      })),
    };
  }

  toCreateResponse(def: ConnectorDefinition): CreateCustomConnectorResponseApiDto {
    return { id: def.id, name: def.name, title: def.title };
  }

  /** The one response that carries a manifest verbatim; see the handler's @Auth note. */
  toVersionResponse(row: ConnectorDefinitionVersion): CustomConnectorVersionResponseApiDto {
    return { version: row.version, status: row.status, manifest: row.manifest };
  }

  toVersionStateResponse(
    row: ConnectorDefinitionVersion
  ): CustomConnectorVersionStateResponseApiDto {
    return { version: row.version, status: row.status };
  }

  /**
   * `publishedAt` is forwarded verbatim rather than coalesced to null, matching what
   * PublishCustomConnectorResponseApiDto documents: the key is absent when the stored
   * column carries no value.
   */
  toPublishResponse(
    row: ConnectorDefinitionVersion,
    warnings: string[]
  ): PublishCustomConnectorResponseApiDto {
    return { version: row.version, status: row.status, publishedAt: row.publishedAt, warnings };
  }

  toActivateResponse(
    def: ConnectorDefinition,
    version: number
  ): ActivateCustomConnectorVersionResponseApiDto {
    return { activeVersionId: def.activeVersionId ?? null, activeVersion: version };
  }
}
