import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Auth, AuthorizationContext, AuthContext } from '../../idp';
import { RejectPluginAuth } from '../../idp/decorators';
import { Role } from '../../idp/types/role-config.types';
import { ConnectorFieldsSchema } from '../connector-types/connector-fields-schema';
import { ConnectorSpecification } from '../connector-types/connector-specification';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import { ConnectorService } from '../services/connector/connector.service';
import { ConnectorTestService } from '../services/connector/connector-test.service';
import {
  CreateCustomConnectorRequestApiDto,
  SaveDraftRequestApiDto,
  TestConnectorRequestApiDto,
  UpdateCustomConnectorRequestApiDto,
} from '../dto/presentation/custom-connector.dto';
import {
  ActivateCustomConnectorVersionResponseApiDto,
  ConnectorTestResultResponseApiDto,
  CreateCustomConnectorResponseApiDto,
  CustomConnectorDetailResponseApiDto,
  CustomConnectorListItemResponseApiDto,
  CustomConnectorVersionResponseApiDto,
  CustomConnectorVersionStateResponseApiDto,
  DeleteCustomConnectorResponseApiDto,
  PublishCustomConnectorResponseApiDto,
} from '../dto/presentation/custom-connector-response.dto';
import { ConnectorDefinitionMapper } from '../mappers/connector-definition.mapper';
import {
  ActivateCustomConnectorVersionSpec,
  CreateCustomConnectorSpec,
  DeleteCustomConnectorSpec,
  GetCustomConnectorFieldsSpec,
  GetCustomConnectorSpec,
  GetCustomConnectorSpecificationSpec,
  GetCustomConnectorVersionSpec,
  ListCustomConnectorsSpec,
  PublishCustomConnectorSpec,
  SaveCustomConnectorDraftSpec,
  TestCustomConnectorSpec,
  UpdateCustomConnectorSpec,
} from './spec/connector-definition.api';

/**
 * A manifest saved here is code: publishing one makes it executable server-side in a
 * spawned Node process on the next connector run. The plugin guard is default-allow, so
 * without this refusal an installed third-party page bridging through `ctx.owox` could
 * author, publish and activate that manifest on an editor's behalf.
 *
 * Refused at class level rather than per handler: nothing outside the first-party builder
 * UI calls this API, so the reads have no plugin consumer to keep open either.
 *
 * Deliberately NOT paired with @RejectApiKeyAuth: an API key is the programmatic path a
 * project owner legitimately uses here (`owox-ctl`). Should one ever be added, it must sit
 * on the line directly above this decorator -- see idp/decorators/plugin-auth-coverage.spec.ts.
 */
@Controller('connectors/custom')
@ApiTags('Custom Connectors')
@RejectPluginAuth()
export class ConnectorDefinitionController {
  constructor(
    private readonly definitionService: ConnectorDefinitionService,
    private readonly connectorService: ConnectorService,
    private readonly testService: ConnectorTestService,
    private readonly mapper: ConnectorDefinitionMapper
  ) {}

  /**
   * The active version numbers are resolved in ONE query for the whole page, not one per row.
   * Awaiting a per-definition lookup inside the map made this 1 + K queries, each of which
   * read the version's `manifest` column (up to 120 KiB) to recover a single integer.
   *
   * `logo` stays inline and is not lazily loaded: the builder index renders it for every
   * card, and connector-definition.controller.openapi.spec.ts pins it `required` on the list
   * item, so dropping it here is a breaking API change. It is bounded instead --
   * CreateCustomConnectorRequestApiDto caps it at the `text` column's 65535 bytes.
   */
  @Auth(Role.viewer())
  @Get()
  @ListCustomConnectorsSpec()
  async list(
    @AuthContext() ctx: AuthorizationContext
  ): Promise<CustomConnectorListItemResponseApiDto[]> {
    const defs = await this.definitionService.listByProject(ctx.projectId);
    const activeVersionByDefId = await this.definitionService.getActiveVersionNumbersByDefId(defs);
    return this.mapper.toListResponse(defs, activeVersionByDefId);
  }

  @Auth(Role.editor())
  @Post()
  @CreateCustomConnectorSpec()
  async create(
    @AuthContext() ctx: AuthorizationContext,
    @Body() body: CreateCustomConnectorRequestApiDto
  ): Promise<CreateCustomConnectorResponseApiDto> {
    const def = await this.definitionService.create(ctx.projectId, ctx.userId, {
      name: body.name,
      title: body.title,
      description: body.description ?? null,
      logo: body.logo ?? null,
      docUrl: body.docUrl ?? null,
      manifest: body.manifest,
    });
    return this.mapper.toCreateResponse(def);
  }

  @Auth(Role.editor())
  @Post('test')
  @TestCustomConnectorSpec()
  async test(
    @AuthContext() ctx: AuthorizationContext,
    @Body() body: TestConnectorRequestApiDto
  ): Promise<ConnectorTestResultResponseApiDto> {
    return this.testService.runTest({
      projectId: ctx.projectId,
      manifest: body.manifest,
      node: body.node,
      configuration: body.configuration,
      maxRows: body.maxRows,
      maxPages: body.maxPages,
    });
  }

  @Auth(Role.viewer())
  @Get(':id')
  @GetCustomConnectorSpec()
  async get(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string
  ): Promise<CustomConnectorDetailResponseApiDto> {
    const def = await this.definitionService.getById(ctx.projectId, id);
    const versions = await this.definitionService.listVersions(ctx.projectId, id);
    const activeVersion = await this.definitionService.getActiveVersionNumberForDef(def);
    return this.mapper.toDetailResponse(def, versions, activeVersion);
  }

  /**
   * Editor rather than viewer for the obvious reason, and PATCH rather than PUT because the
   * body is a partial: what it omits, it leaves alone.
   *
   * `name` is not in the body and must not be added. A data mart names the connector it runs
   * in `connector.source.name`, and that field is shared with bundled connectors, which have
   * no id to use instead -- so a rename here would silently unbind every data mart that
   * pointed at the old name. Freeing a name for reuse is what deleting the connector does.
   */
  @Auth(Role.editor())
  @Patch(':id')
  @UpdateCustomConnectorSpec()
  async update(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string,
    @Body() body: UpdateCustomConnectorRequestApiDto
  ): Promise<CustomConnectorDetailResponseApiDto> {
    const def = await this.definitionService.updateMetadata(ctx.projectId, id, body);
    const versions = await this.definitionService.listVersions(ctx.projectId, id);
    const activeVersion = await this.definitionService.getActiveVersionNumberForDef(def);
    return this.mapper.toDetailResponse(def, versions, activeVersion);
  }

  /**
   * The only endpoint that returns a manifest verbatim, and the reason it is the one read
   * here that requires an editor.
   *
   * A manifest is author-written JSON. The builder invites pasting a working `curl`, and
   * nothing rejects a manifest that carries a literal `Authorization: Bearer ...` — the
   * SECRET pipeline protects PARAMETER VALUES in a Data Mart's configuration, never the
   * connector body itself. Served at viewer level, that body reached every project member
   * and every database dump.
   *
   * Restricting rather than masking: a manifest is code, so a credential can sit anywhere
   * in arbitrary JSON with no attribute to key off, and the sole consumer — the builder's
   * `loadConnector` — writes the manifest straight back on the next save, so a masked copy
   * would be persisted as the connector. The cost is that a viewer can no longer inspect
   * version history in the builder; they had no workflow there, since save, publish,
   * activate and delete are all @Auth(Role.editor()) already.
   *
   * The siblings stay at viewer deliberately: `list` and `get` carry version METADATA and
   * no manifest (and `get` backs the version-pinning popover a viewer sees on a Data
   * Mart), while `specification` and `fields` are derived parameter/field schemas that
   * render the config form.
   *
   * "Derived" only earns viewer access while the derivation actually drops the sensitive
   * parts, and twice it did not: a SECRET parameter's `default` travelled verbatim (closed
   * in ConnectorService.mapConfigFieldToSchema, which withholds a SECRET parameter's
   * values), and `?version=` served DRAFT manifests (closed in
   * ConnectorDefinitionService.resolveManifest, which now serves published versions only).
   * Anything added to those two payloads has to be re-checked against that bar.
   */
  @Auth(Role.editor())
  @Get(':id/versions/:version')
  @GetCustomConnectorVersionSpec()
  async getVersion(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number
  ): Promise<CustomConnectorVersionResponseApiDto> {
    const row = await this.definitionService.getVersion(ctx.projectId, id, version);
    return this.mapper.toVersionResponse(row);
  }

  @Auth(Role.editor())
  @Put(':id/draft')
  @SaveCustomConnectorDraftSpec()
  async saveDraft(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string,
    @Body() body: SaveDraftRequestApiDto
  ): Promise<CustomConnectorVersionStateResponseApiDto> {
    const row = await this.definitionService.saveDraft(ctx.projectId, id, body.manifest);
    return this.mapper.toVersionStateResponse(row);
  }

  @Auth(Role.editor())
  @Post(':id/publish')
  @PublishCustomConnectorSpec()
  async publish(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string
  ): Promise<PublishCustomConnectorResponseApiDto> {
    const { version: row, warnings } = await this.definitionService.publish(ctx.projectId, id);
    return this.mapper.toPublishResponse(row, warnings);
  }

  @Auth(Role.editor())
  @Post(':id/versions/:version/activate')
  @ActivateCustomConnectorVersionSpec()
  async activate(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number
  ): Promise<ActivateCustomConnectorVersionResponseApiDto> {
    const def = await this.definitionService.setActiveVersion(ctx.projectId, id, version);
    return this.mapper.toActivateResponse(def, version);
  }

  @Auth(Role.editor())
  @Delete(':id')
  @DeleteCustomConnectorSpec()
  async remove(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string
  ): Promise<DeleteCustomConnectorResponseApiDto> {
    await this.definitionService.softDelete(ctx.projectId, id);
    return { success: true };
  }

  @Auth(Role.viewer())
  @Get(':id/specification')
  @GetCustomConnectorSpecificationSpec()
  async specification(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string,
    @Query('version', new ParseIntPipe({ optional: true })) version?: number
  ): Promise<ConnectorSpecification> {
    const def = await this.definitionService.getById(ctx.projectId, id);
    const manifest = await this.definitionService.resolveManifest(ctx.projectId, def.name, version);
    return this.connectorService.getSpecificationFromManifest(manifest);
  }

  @Auth(Role.viewer())
  @Get(':id/fields')
  @GetCustomConnectorFieldsSpec()
  async fields(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string,
    @Query('version', new ParseIntPipe({ optional: true })) version?: number
  ): Promise<ConnectorFieldsSchema> {
    const def = await this.definitionService.getById(ctx.projectId, id);
    const manifest = await this.definitionService.resolveManifest(ctx.projectId, def.name, version);
    return this.connectorService.getFieldsSchemaFromManifest(manifest);
  }
}
