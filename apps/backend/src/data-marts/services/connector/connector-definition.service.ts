import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';

import { AvailableConnectors, Core } from '@owox/connectors';

import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { MAX_MANIFEST_SIZE_BYTES } from '../../dto/presentation/custom-connector.dto';
import { ConnectorDefinition as ConnectorSourceDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { ConnectorDefinition } from '../../entities/connector-definition.entity';
import {
  ConnectorDefinitionVersion,
  ConnectorDefinitionVersionStatus,
} from '../../entities/connector-definition-version.entity';
import { DataMartService } from '../data-mart.service';

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED_NAMES: Set<string> = new Set(AvailableConnectors as string[]);

/**
 * The only columns needed to answer "which version number is active?".
 *
 * Named once because both callers below must keep `manifest` out: it is the row's heavy
 * column (up to MAX_MANIFEST_SIZE_BYTES, 120 KiB) and a query with no `select` reads it in
 * full to hand back one integer.
 */
const ACTIVE_VERSION_NUMBER_COLUMNS: (keyof ConnectorDefinitionVersion)[] = ['id', 'version'];

/**
 * The subset of the parsed manifest model this service reads. `Core` is typed as an
 * `any` index signature by @owox/connectors, so name the shape here rather than
 * threading `any` through the publish path.
 */
interface ParsedManifestAuthReport {
  /** Parameters ManifestParser marked SECRET on the author's behalf. */
  autoSecretAuthParameters?: string[];
  /** Credential references with no parameter declaration to mark — unprotected. */
  undeclaredAuthParameters?: string[];
  /**
   * Credential-looking parameters a NODE REQUEST interpolates without a SECRET attribute.
   * The parser reports these instead of marking them: a node request also carries page
   * sizes, dates and account ids, so it is not a credential position.
   */
  unprotectedRequestParameters?: { parameter: string; usedIn?: string[] }[];
}

export interface CreateConnectorDefinitionInput {
  name: string;
  title: string;
  description?: string | null;
  logo?: string | null;
  docUrl?: string | null;
  manifest: Record<string, unknown>;
}

@Injectable()
export class ConnectorDefinitionService {
  private readonly logger = new Logger(ConnectorDefinitionService.name);

  constructor(
    @InjectRepository(ConnectorDefinition)
    private readonly definitionRepo: Repository<ConnectorDefinition>,
    @InjectRepository(ConnectorDefinitionVersion)
    private readonly versionRepo: Repository<ConnectorDefinitionVersion>,
    private readonly dataMartService: DataMartService
  ) {}

  /**
   * A definition with no versions is unrecoverable through the API: resolveActiveOrLatest()
   * returns null so every read 404s, while assertNameAvailable() queries withDeleted: true
   * and keeps the name reserved forever. Both rows land together or neither does.
   */
  @Transactional()
  async create(
    projectId: string,
    userId: string,
    input: CreateConnectorDefinitionInput
  ): Promise<ConnectorDefinition> {
    this.assertManifestFitsSpawn(input.manifest);
    await this.assertNameAvailable(projectId, input.name);

    const definition = await this.definitionRepo.save(
      this.definitionRepo.create({
        projectId,
        name: input.name,
        title: input.title,
        description: input.description ?? null,
        logo: input.logo ?? null,
        docUrl: input.docUrl ?? null,
        createdById: userId,
      })
    );

    await this.versionRepo.save(
      this.versionRepo.create({
        connectorDefinitionId: definition.id,
        version: 1,
        manifest: input.manifest,
        status: ConnectorDefinitionVersionStatus.DRAFT,
        createdById: userId,
      })
    );

    return definition;
  }

  /**
   * Creates a connector and publishes its first version as ONE unit.
   *
   * create() stores whatever manifest it is handed -- a draft is allowed to be incomplete,
   * which is the whole point of the builder -- and publish() is where ManifestParser gets a
   * say. Run as two transactions that is a trap for any caller who does both in a single
   * operation, which the MCP `connector_publish` tool does: the parser rejects the manifest,
   * publish() throws, and the definition row stays committed with nothing but an
   * unpublishable draft. assertNameAvailable() searches `withDeleted: true`, so that row
   * holds the connector's name for the life of the project, and the obvious retry -- publish
   * it again with the manifest corrected -- fails with "already exists in this project" on a
   * connector the caller was never told about.
   *
   * One transaction instead of validating up front: publish() must remain the authority on
   * what a valid manifest is, and a second parse here would be a copy of that rule free to
   * drift from it.
   */
  @Transactional()
  async createAndPublish(
    projectId: string,
    userId: string,
    input: CreateConnectorDefinitionInput
  ): Promise<{ definition: ConnectorDefinition; version: ConnectorDefinitionVersion }> {
    const definition = await this.create(projectId, userId, input);
    const version = await this.publish(projectId, definition.id);
    return { definition, version };
  }

  async listByProject(projectId: string): Promise<ConnectorDefinition[]> {
    return this.definitionRepo.find({ where: { projectId } });
  }

  async getById(projectId: string, id: string): Promise<ConnectorDefinition> {
    const def = await this.definitionRepo.findOne({ where: { id, projectId } });
    if (!def) {
      throw new NotFoundException(`Custom connector '${id}' not found`);
    }
    return def;
  }

  async listVersions(projectId: string, id: string): Promise<ConnectorDefinitionVersion[]> {
    await this.getById(projectId, id);
    return this.versionRepo.find({
      where: { connectorDefinitionId: id },
      order: { version: 'ASC' },
    });
  }

  async getVersion(
    projectId: string,
    id: string,
    version: number
  ): Promise<ConnectorDefinitionVersion> {
    await this.getById(projectId, id);
    const row = await this.versionRepo.findOne({
      where: { connectorDefinitionId: id, version },
    });
    if (!row) {
      throw new NotFoundException(`Version ${version} of connector '${id}' not found`);
    }
    return row;
  }

  async resolveManifest(
    projectId: string,
    name: string,
    version?: number
  ): Promise<Record<string, unknown>> {
    const def = await this.definitionRepo.findOne({ where: { projectId, name } });
    if (!def) {
      throw new NotFoundException(`Custom connector '${name}' not found`);
    }
    const row =
      version !== undefined
        ? await this.versionRepo.findOne({
            where: { connectorDefinitionId: def.id, version },
          })
        : await this.resolveActiveOrLatest(def);
    if (!row) {
      throw new NotFoundException(
        `No ${version !== undefined ? `version ${version}` : 'active or available version'} for connector '${name}'`
      );
    }
    return row.manifest;
  }

  /**
   * Resolves the manifest for the RUN path. Unlike resolveManifest/resolveActiveOrLatest
   * (preview/spec path, which may serve drafts), this resolves ONLY published versions:
   * - returns null when no ConnectorDefinition exists for the name (bundled connector);
   * - when a version is pinned, requires that exact version to be PUBLISHED;
   * - when unpinned, requires the active version to be PUBLISHED;
   * - otherwise throws BadRequestException (we never silently run a draft or a
   *   different version than the one pinned/active).
   */
  async tryResolveManifest(
    projectId: string,
    name: string,
    version?: number
  ): Promise<Record<string, unknown> | null> {
    const def = await this.definitionRepo.findOne({ where: { projectId, name } });
    if (!def) {
      return null;
    }
    const row =
      version !== undefined
        ? await this.versionRepo.findOne({
            where: {
              connectorDefinitionId: def.id,
              version,
              status: ConnectorDefinitionVersionStatus.PUBLISHED,
            },
          })
        : def.activeVersionId
          ? await this.versionRepo.findOne({
              where: {
                id: def.activeVersionId,
                status: ConnectorDefinitionVersionStatus.PUBLISHED,
              },
            })
          : null;
    if (!row) {
      throw new BadRequestException(
        `Custom connector '${name}' has no published version${version !== undefined ? ` ${version}` : ''} to run`
      );
    }
    return row.manifest;
  }

  async saveDraft(
    projectId: string,
    id: string,
    manifest: Record<string, unknown>
  ): Promise<ConnectorDefinitionVersion> {
    this.assertManifestFitsSpawn(manifest);
    await this.getById(projectId, id);
    const latest = await this.versionRepo.findOne({
      where: { connectorDefinitionId: id },
      order: { version: 'DESC' },
    });

    if (latest && latest.status === ConnectorDefinitionVersionStatus.DRAFT) {
      latest.manifest = manifest;
      return this.versionRepo.save(latest);
    }

    const nextVersion = (latest?.version ?? 0) + 1;
    return this.versionRepo.save(
      this.versionRepo.create({
        connectorDefinitionId: id,
        version: nextVersion,
        manifest,
        status: ConnectorDefinitionVersionStatus.DRAFT,
      })
    );
  }

  /**
   * Marking the draft published and pointing the definition at it are one change: a version
   * flagged published that nothing activates is a release users cannot see or roll back.
   */
  @Transactional()
  async publish(projectId: string, id: string): Promise<ConnectorDefinitionVersion> {
    const def = await this.getById(projectId, id);
    const draft = await this.versionRepo.findOne({
      where: { connectorDefinitionId: id, status: ConnectorDefinitionVersionStatus.DRAFT },
      order: { version: 'DESC' },
    });
    if (!draft) {
      throw new BadRequestException(`Connector '${id}' has no draft to publish`);
    }

    let model: ParsedManifestAuthReport;
    try {
      model = new Core.ManifestParser().parse(
        JSON.stringify(draft.manifest)
      ) as ParsedManifestAuthReport;
    } catch (e) {
      throw new BadRequestException(`Invalid connector manifest: ${(e as Error).message}`);
    }

    this.reportAuthSecretCoverage(def.name, draft.version, model);

    draft.status = ConnectorDefinitionVersionStatus.PUBLISHED;
    draft.publishedAt = new Date();
    const published = await this.versionRepo.save(draft);

    def.activeVersionId = published.id;
    await this.definitionRepo.save(def);

    return published;
  }

  async setActiveVersion(
    projectId: string,
    id: string,
    version: number
  ): Promise<ConnectorDefinition> {
    const def = await this.getById(projectId, id);
    const row = await this.versionRepo.findOne({
      where: {
        connectorDefinitionId: id,
        version,
        status: ConnectorDefinitionVersionStatus.PUBLISHED,
      },
    });
    if (!row) {
      throw new BadRequestException(
        `Connector '${id}' has no published version ${version} to activate`
      );
    }
    def.activeVersionId = row.id;
    return this.definitionRepo.save(def);
  }

  /**
   * `select` is not an optimisation here so much as a correction: the only column wanted is
   * an integer, and without it the row's `manifest` -- up to MAX_MANIFEST_SIZE_BYTES, 120 KiB
   * -- is read and hydrated to produce it.
   */
  async getActiveVersionNumberForDef(def: ConnectorDefinition): Promise<number | null> {
    if (!def.activeVersionId) return null;
    const row = await this.versionRepo.findOne({
      where: { id: def.activeVersionId },
      select: ACTIVE_VERSION_NUMBER_COLUMNS,
    });
    return row ? row.version : null;
  }

  /**
   * The list-page counterpart of getActiveVersionNumberForDef, keyed by definition id.
   *
   * Called per definition, that method is one query per row on an endpoint that returns the
   * whole project -- and each of those queries read a `manifest` column to recover a single
   * integer, so a hundred connectors cost ~18 MB of database traffic to render a hundred
   * 24x24 icons. This resolves them all in one.
   *
   * A `find` with `In`, not `relations`: ConnectorDefinition.activeVersionId is a bare
   * @Column with no relation declared in that direction (the @ManyToOne lives on
   * ConnectorDefinitionVersion, pointing the other way), so there is no relation for TypeORM
   * to eager-load. Definitions with no active version are filtered out before the query
   * rather than passed as nulls, so an all-unpublished project issues no query at all.
   */
  async getActiveVersionNumbersByDefId(defs: ConnectorDefinition[]): Promise<Map<string, number>> {
    const activeVersionIds = defs
      .map(def => def.activeVersionId)
      .filter((id): id is string => Boolean(id));

    if (activeVersionIds.length === 0) {
      return new Map();
    }

    const rows = await this.versionRepo.find({
      where: { id: In(activeVersionIds) },
      select: ACTIVE_VERSION_NUMBER_COLUMNS,
    });

    const versionNumberById = new Map(rows.map(row => [row.id, row.version]));
    const byDefId = new Map<string, number>();
    for (const def of defs) {
      const version = def.activeVersionId ? versionNumberById.get(def.activeVersionId) : undefined;
      if (version !== undefined) {
        byDefId.set(def.id, version);
      }
    }
    return byDefId;
  }

  /**
   * Soft-deletes a custom connector, refusing when any data mart still references it.
   * Data marts point at a connector by NAME (definition.connector.source.name), not by
   * this row's id, so the lookup fetches the project's CONNECTOR data marts and filters
   * in memory — no JSON-column query, which keeps this portable across sqlite/mysql/postgres.
   * Mirrors the storage guard in delete-data-storage.service.ts.
   */
  async softDelete(projectId: string, id: string): Promise<void> {
    const def = await this.getById(projectId, id);

    const connectorMarts = await this.dataMartService.findByProjectIdAndDefinitionType(
      projectId,
      DataMartDefinitionType.CONNECTOR
    );
    const referencedDataMarts = connectorMarts
      .filter(
        mart =>
          (mart.definition as ConnectorSourceDefinition | undefined)?.connector?.source?.name ===
          def.name
      )
      .map(mart => mart.id);

    if (referencedDataMarts.length > 0) {
      throw new BusinessViolationException(
        'Cannot delete the connector because it is referenced by existing data marts.',
        { referencedDataMarts }
      );
    }

    await this.definitionRepo.softDelete(id);
  }

  /**
   * Validate a declarative connector manifest via the engine's ManifestParser.
   * Returns an error message string when invalid, or null when valid.
   */
  validateManifest(manifest: Record<string, unknown>): string | null {
    try {
      new Core.ManifestParser().parse(JSON.stringify(manifest));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  /**
   * Makes the parser's SECRET sweep observable at publish time.
   *
   * A custom connector's specification is user-authored JSON, and every credential
   * protection downstream (externalising the value into connector_source_credentials
   * instead of leaving it inline in `data_mart.definition`, masking it on the
   * viewer-readable GET /data-marts/:id) keys off the SECRET attribute in that
   * specification. ManifestParser now marks the parameters a manifest interpolates
   * into a credential position of `authentication`, so the common case is covered
   * silently — this logs what it did, because a field the author did not mark
   * suddenly being masked and externalised should not look like a bug.
   *
   * The residue is a credential reference to a parameter that was never declared:
   * there is no descriptor to attach the attribute to, so the sweep cannot protect
   * it. That is a WARNING and not a refusal on purpose:
   *  - the exposure itself is already closed by auto-marking; what is left is the
   *    parser's blind spot, and refusing on uncertainty punishes correct manifests;
   *  - such a manifest can publish and run today. An undeclared reference inside a
   *    `selective` branch nobody selects is never rendered, so a refusal would break
   *    connectors that work in production, trading a silent leak for silent breakage;
   *  - publish is a UI action with no override, so a hard block would strand an
   *    author whose manifest the parser misreads, with no way through.
   */
  private reportAuthSecretCoverage(
    connectorName: string,
    version: number,
    model: ParsedManifestAuthReport
  ): void {
    const autoMarked = model.autoSecretAuthParameters ?? [];
    if (autoMarked.length > 0) {
      this.logger.log(
        `Connector '${connectorName}' v${version}: marked ${autoMarked.join(', ')} as SECRET — ` +
          `used by "authentication" but not declared secret in the manifest. ` +
          `These values are stored separately and masked in API responses.`
      );
    }

    const undeclared = model.undeclaredAuthParameters ?? [];
    if (undeclared.length > 0) {
      this.logger.warn(
        `Connector '${connectorName}' v${version}: "authentication" references undeclared ` +
          `parameter(s) ${undeclared.join(', ')}. They cannot be marked SECRET, so any value ` +
          `supplied under those names stays in plain text in the Data Mart definition. ` +
          `Declare them in "parameters" to have them protected.`
      );
    }

    // The sweep's remaining blind spot. Auto-marking is safe for `authentication` because
    // that IS a credential position; a node request is not — it also carries page sizes,
    // dates, account ids and field lists, and marking those would mask ordinary
    // configuration and externalise it into the credentials table. So the parser reports
    // instead, and this is where the author finds out, while the decision stays theirs.
    for (const entry of model.unprotectedRequestParameters ?? []) {
      const where = entry.usedIn?.length ? ` at ${entry.usedIn.join(', ')}` : '';
      this.logger.warn(
        `Connector '${connectorName}' v${version}: parameter '${entry.parameter}' looks like a ` +
          `credential and is interpolated into a node request${where}, but is not marked SECRET. ` +
          `Its value stays in plain text in the Data Mart definition and is returned to anyone ` +
          `who can read the Data Mart. Add "attributes": ["SECRET"] to the parameter if it is a ` +
          `credential.`
      );
    }
  }

  /**
   * Refuses a manifest the connector runner could never be handed.
   *
   * Every stored manifest is passed to the child process through the OW_MANIFEST environment
   * variable (ConnectorProcessSpawnerService.buildChildEnv and ConnectorTestService both
   * JSON.stringify it), and Linux -- the deployment target -- rejects a single env string
   * longer than MAX_ARG_STRLEN, 32 * PAGE_SIZE = 131072 bytes. Past that, the connector still
   * saves and publishes fine and then dies at spawn with an opaque E2BIG on every run,
   * by which point it is bound to a Data Mart. ConnectorExecutorService.stripManifestForRunner
   * removes only `logo`, so nothing else shrinks it on the way out.
   *
   * Enforced here rather than only on CreateCustomConnectorRequestApiDto because this is the
   * choke point both entrances share: the MCP tools take their manifest through their own Zod
   * schemas (`manifest: z.record(z.unknown())`, unbounded) and reach create()/saveDraft()
   * without touching that DTO. The HTTP DTO keeps its own `@MaxJsonSize` so the refusal still
   * arrives as a field-level 400 with the rest of the body's errors.
   *
   * Measured in BYTES, matching what the kernel counts: a manifest carries user-authored
   * labels and descriptions, and a character count would wave through a manifest up to three
   * times over the limit.
   */
  private assertManifestFitsSpawn(manifest: Record<string, unknown>): void {
    const sizeBytes = Buffer.byteLength(JSON.stringify(manifest), 'utf8');
    if (sizeBytes > MAX_MANIFEST_SIZE_BYTES) {
      throw new BadRequestException(
        `Connector manifest is ${sizeBytes} bytes, over the ${MAX_MANIFEST_SIZE_BYTES}-byte limit. ` +
          `A larger manifest cannot be passed to the connector runner, so it would fail on every run.`
      );
    }
  }

  private async resolveActiveOrLatest(
    def: ConnectorDefinition
  ): Promise<ConnectorDefinitionVersion | null> {
    if (def.activeVersionId) {
      const active = await this.versionRepo.findOne({ where: { id: def.activeVersionId } });
      if (active) return active;
    }
    return this.versionRepo.findOne({
      where: { connectorDefinitionId: def.id },
      order: { version: 'DESC' },
    });
  }

  private async assertNameAvailable(projectId: string, name: string): Promise<void> {
    if (!NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        `Connector name '${name}' is invalid: must start with a letter and contain only letters, digits, or underscores`
      );
    }
    if (RESERVED_NAMES.has(name)) {
      throw new BadRequestException(`Connector name '${name}' is reserved by a built-in connector`);
    }
    // withDeleted: true is deliberate — a soft-deleted connector's name stays reserved in its
    // project so a new connector can never collide with (and thus resurrect ambiguity around) one
    // that was previously deleted.
    const existing = await this.definitionRepo.findOne({
      where: { projectId, name },
      withDeleted: true,
    });
    if (existing) {
      throw new BadRequestException(
        `A custom connector named '${name}' already exists in this project`
      );
    }
  }
}
