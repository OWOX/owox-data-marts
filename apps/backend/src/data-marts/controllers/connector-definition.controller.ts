import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
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
    private readonly testService: ConnectorTestService
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
    return defs.map(d => ({
      id: d.id,
      name: d.name,
      title: d.title,
      description: d.description ?? null,
      logo: d.logo ?? null,
      docUrl: d.docUrl ?? null,
      activeVersionId: d.activeVersionId ?? null,
      activeVersion: activeVersionByDefId.get(d.id) ?? null,
    }));
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
    return { id: def.id, name: def.name, title: def.title };
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
    return {
      id: def.id,
      name: def.name,
      title: def.title,
      description: def.description ?? null,
      logo: def.logo ?? null,
      docUrl: def.docUrl ?? null,
      activeVersionId: def.activeVersionId ?? null,
      activeVersion: await this.definitionService.getActiveVersionNumberForDef(def),
      versions: versions.map(v => ({
        version: v.version,
        status: v.status,
        publishedAt: v.publishedAt ?? null,
      })),
    };
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
   * render the config form. None of them can leak the connector body.
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
    return { version: row.version, status: row.status, manifest: row.manifest };
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
    return { version: row.version, status: row.status };
  }

  @Auth(Role.editor())
  @Post(':id/publish')
  @PublishCustomConnectorSpec()
  async publish(
    @AuthContext() ctx: AuthorizationContext,
    @Param('id') id: string
  ): Promise<PublishCustomConnectorResponseApiDto> {
    const row = await this.definitionService.publish(ctx.projectId, id);
    return { version: row.version, status: row.status, publishedAt: row.publishedAt };
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
    return { activeVersionId: def.activeVersionId ?? null, activeVersion: version };
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
