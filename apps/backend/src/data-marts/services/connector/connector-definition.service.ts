import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Transactional } from 'typeorm-transactional';

import { AvailableConnectors, Core } from '@owox/connectors';

import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { isUniqueConstraintViolation } from '../../../common/typeorm/query-error.utils';
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

/** `name` is `varchar` in the migration, so TypeORM's default length is the ceiling. */
const MAX_NAME_LENGTH = 255;

/**
 * The name a deleted connector's row keeps.
 *
 * Deleting `someConn` and creating it again is an ordinary thing to do, and softDelete()
 * already refuses while any data mart still points at the name, so by the time a row is
 * tombstoned nothing can be left referring to it. The name has to come free.
 *
 * It cannot simply be released. IDX_connector_definition_projectId_name is what actually
 * keeps two concurrent creates apart, and it spans tombstones as much as live rows. Widening
 * it to (projectId, name, deletedAt) looks like the fix and is the opposite of one: NULLs
 * compare distinct in a unique index on sqlite, MySQL and Postgres alike, so two LIVE rows --
 * both NULL there -- would stop colliding, which is the single thing the index exists to
 * prevent. A partial index would state it exactly and MySQL has none.
 *
 * So the row keeps a name no user can type: NAME_PATTERN admits letters, digits and
 * underscores only, and this carries colons. The id makes it unique per row, so a name may be
 * reused any number of times. The original trails it, truncated to fit, because reading the
 * table later is the only thing a tombstone is still good for.
 */
function tombstonedName(name: string, id: string): string {
  const prefix = `deleted:${id}:`;
  return prefix + name.slice(0, MAX_NAME_LENGTH - prefix.length);
}

/**
 * Bundled connector names, folded to lower case — see assertNameAvailable for why the fold
 * is here and not left to the database.
 *
 * Tolerates the export being absent, which `new Set(undefined)` used to do implicitly: this
 * module is imported transitively by suites that mock @owox/connectors down to the handful of
 * `Core` members they use, and a constant that throws while the module is being evaluated
 * takes the whole suite with it rather than the one test that touches names.
 */
const RESERVED_NAMES: ReadonlySet<string> = new Set(
  ((AvailableConnectors as string[] | undefined) ?? []).map(name => name.toLowerCase())
);

/**
 * How many times saveDraft() re-reads and tries again before giving up. Each loss is a stale
 * read, so a retry is the fix; a bound is what keeps a pathologically contended connector
 * from spinning instead of answering.
 */
const SAVE_DRAFT_ATTEMPTS = 3;

/**
 * The only columns needed to answer "which version number is active?".
 *
 * Named once because both callers below must keep `manifest` out: it is the row's heavy
 * column (up to MAX_MANIFEST_SIZE_BYTES, 120 KiB) and a query with no `select` reads it in
 * full to hand back one integer.
 */
const ACTIVE_VERSION_NUMBER_COLUMNS: (keyof ConnectorDefinitionVersion)[] = ['id', 'version'];

/**
 * The columns listVersions() serves. Same reasoning as ACTIVE_VERSION_NUMBER_COLUMNS, with
 * more at stake: this one returns EVERY version of a connector, so without a `select` a
 * connector with a long history reads its whole manifest history — up to
 * MAX_MANIFEST_SIZE_BYTES (120 KiB) per row — to render a list of version numbers.
 */
const VERSION_SUMMARY_COLUMNS: (keyof ConnectorDefinitionVersion)[] = [
  'id',
  'version',
  'status',
  'publishedAt',
];

/**
 * What listVersions() returns: the version metadata both of its callers render — the REST
 * GET :id version list and MCP `connector_versions`, which adds an isActive flag by
 * comparing `id` against the definition's activeVersionId. Named as a projection rather than
 * left as ConnectorDefinitionVersion so the missing `manifest` is in the type, not a
 * surprise at the call site.
 */
export type ConnectorDefinitionVersionSummary = Pick<
  ConnectorDefinitionVersion,
  'id' | 'version' | 'status' | 'publishedAt'
>;

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
  /** The parameter map AFTER the parser's SECRET sweep, i.e. the attributes that will apply. */
  parameters?: Record<string, unknown>;
}

/**
 * The outcome of a publish, warnings included.
 *
 * `warnings` travels with the version rather than staying in the log because the log is not
 * a surface an author has: on managed cloud they cannot read it at all, and these warnings
 * are the ONLY thing telling them a credential they authored will be stored in plain text.
 * Always an array, empty when there is nothing to say, so a caller can tell "nothing to
 * report" from "this response predates warnings".
 */
export interface PublishedConnectorVersion {
  version: ConnectorDefinitionVersion;
  warnings: string[];
}

export interface CreateConnectorDefinitionInput {
  name: string;
  title: string;
  description?: string | null;
  logo?: string | null;
  docUrl?: string | null;
  manifest: Record<string, unknown>;
}

/**
 * A partial update of the display metadata. An absent key leaves the column alone; an explicit
 * null clears one of the three nullable ones.
 *
 * `name` is absent by design and must stay that way -- a data mart points at its connector by
 * name, so renaming a definition would strand it. See UpdateCustomConnectorRequestApiDto.
 */
export interface UpdateConnectorDefinitionMetadataInput {
  title?: string;
  description?: string | null;
  logo?: string | null;
  docUrl?: string | null;
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
   * A definition with no versions is a broken connector: listByProject() shows it like any
   * other, resolveActivePublished() returns null so every read of it 404s, and it holds its
   * name while it sits there. Recoverable now -- deleting it frees the name, which is what
   * softDelete() is for -- but only by a user who works out that the entry they cannot open
   * is the reason the name is taken. Both rows land together or neither does.
   */
  @Transactional()
  async create(
    projectId: string,
    userId: string,
    input: CreateConnectorDefinitionInput
  ): Promise<ConnectorDefinition> {
    this.assertManifestFitsSpawn(input.manifest);
    await this.assertNameAvailable(projectId, input.name);

    let definition: ConnectorDefinition;
    try {
      definition = await this.definitionRepo.save(
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
    } catch (e) {
      if (!isUniqueConstraintViolation(e)) {
        throw e;
      }
      // assertNameAvailable() reads before this writes, so the name it cleared can be taken
      // in between; IDX_connector_definition_projectId_name is what actually keeps the two
      // creates apart. Untranslated that arrived as a 500 on a request whose problem is
      // entirely client-side and entirely explainable.
      //
      // 409 rather than the guard's 400 on purpose: the guard means "this name is taken,
      // choose another" and is deterministic, while this means "you lost a race" — and a
      // client that retries a 409 gets the guard's 400, with the same wording, from the read.
      throw new ConflictException(
        `A custom connector named '${input.name}' was just created in this project by another request`
      );
    }

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
   * unpublishable draft. That row holds the connector's name, and the obvious retry -- publish
   * it again with the manifest corrected -- fails with "already exists in this project" on a
   * connector the caller was never told about. An assistant cannot delete its way out either:
   * softDelete() frees a name, but it needs the id, and the throw carried none.
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
  ): Promise<{ definition: ConnectorDefinition } & PublishedConnectorVersion> {
    const definition = await this.create(projectId, userId, input);
    const { version, warnings } = await this.publish(projectId, definition.id);
    return { definition, version, warnings };
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

  /**
   * Updates the connector's display metadata.
   *
   * These columns are a project-local projection of the same fields in the manifest. The
   * manifest is what travels -- it is exported, and MCP publishes it -- while these are what
   * every connector list, picker and data-mart page reads. create() seeds them from the
   * manifest and, before this, nothing kept them in step: a title edited in the builder saved
   * without complaint into the draft and changed nothing anyone could see, because the builder
   * was the one surface reading the manifest rather than the row.
   *
   * Deliberately separate from saveDraft() rather than folded into it. A draft is unpublished
   * by definition, and syncing the row on every draft save would put a half-typed title in
   * front of every member of the project before its author had finished the thought.
   *
   * A targeted UPDATE of the named columns, for the same reason saveDraft() is one: `save()`
   * writes the whole loaded entity back, and TypeORM ships every column that differs from the
   * snapshot it was read at. `activeVersionId` is on this row and belongs to publish() and
   * activateVersion(); a publish landing between the read and the write would be silently
   * undone -- and the builder's save runs this immediately after saveDraft(), right where a
   * publish is most likely to be racing it.
   */
  async updateMetadata(
    projectId: string,
    id: string,
    patch: UpdateConnectorDefinitionMetadataInput
  ): Promise<ConnectorDefinition> {
    await this.getById(projectId, id);

    const columns: QueryDeepPartialEntity<ConnectorDefinition> = {};
    if (patch.title !== undefined) {
      columns.title = patch.title;
    }
    if (patch.description !== undefined) {
      columns.description = patch.description;
    }
    if (patch.logo !== undefined) {
      columns.logo = patch.logo;
    }
    if (patch.docUrl !== undefined) {
      columns.docUrl = patch.docUrl;
    }

    // An empty body is a no-op, not an error -- and TypeORM rejects an empty update outright.
    if (Object.keys(columns).length > 0) {
      await this.definitionRepo.update({ id, projectId }, columns);
    }

    return this.getById(projectId, id);
  }

  async listVersions(projectId: string, id: string): Promise<ConnectorDefinitionVersionSummary[]> {
    await this.getById(projectId, id);
    return this.versionRepo.find({
      where: { connectorDefinitionId: id },
      order: { version: 'ASC' },
      select: VERSION_SUMMARY_COLUMNS,
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

  /**
   * Resolves the manifest for the SPEC path -- GET :id/specification and :id/fields, which
   * render the parameter and node schemas the Data Mart configuration form draws.
   *
   * PUBLISHED versions only, drafts included in the refusal.
   *
   * The alternative considered was to keep serving drafts and gate them by role -- viewer
   * for the active version, editor for anything else. Rejected because
   * ConnectorDefinitionController has exactly one @Auth level per handler, and manifest
   * reads are separated by ENDPOINT, not by argument: GET :id/versions/:version is editor
   * because it returns the body, while
   * `specification` and `fields` are viewer because they return derived schemas. A handler
   * whose required role depends on a query parameter would be a third rule, and the one an
   * auditor is least likely to spot.
   *
   * Refusing the draft instead costs nothing that exists: an author's own tool is the
   * builder, which never calls this endpoint (it reads the raw manifest through the
   * editor-only version endpoint), and the version-pinning popover a Data Mart offers lists
   * PUBLISHED versions only. What it buys is that the form can no longer be rendered from
   * parameter names and defaults an editor is still typing -- and that the spec agrees with
   * what would actually run, since tryResolveManifest already refuses to run anything but a
   * published version. A form built from a draft the runner would never accept is a bug in
   * its own right.
   */
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
            where: {
              connectorDefinitionId: def.id,
              version,
              status: ConnectorDefinitionVersionStatus.PUBLISHED,
            },
          })
        : await this.resolveActivePublished(def);
    if (!row) {
      throw new NotFoundException(
        `No published ${version !== undefined ? `version ${version}` : 'version'} for connector '${name}'`
      );
    }
    return row.manifest;
  }

  /**
   * Resolves the manifest for the RUN path. Like resolveManifest (the spec path) it serves
   * PUBLISHED versions only; it differs in what it does when there is nothing to serve:
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

  /**
   * Resolves the manifest for the AUTHORING path — MCP `connector_details`, whose caller the
   * facade has already checked for the editor/admin role.
   *
   * Serves the active PUBLISHED version when there is one and falls back to the latest
   * version otherwise, draft included; an explicit version is served whatever its status.
   * Neither of the other two resolvers does that, and the difference is the AUDIENCE rather
   * than a relaxation of either:
   *  - resolveManifest (spec) feeds viewer-readable endpoints that render a configuration
   *    form, so a draft there shows every project member parameters an editor is still
   *    typing — and builds a form for a manifest the runner would refuse;
   *  - tryResolveManifest (run) must never execute anything but what was released;
   *  - this one answers an author about their own work, and that read is already theirs: GET
   *    :id/versions/:version serves any version at @Auth(Role.editor()), and
   *    connector_details withholds its manifest from anyone below that same role.
   *
   * Without it the authoring loop had a hole where its first step should be.
   * `connector_publish` tells callers to read connector_details first, and a connector fresh
   * from create() has exactly one version and it is a draft — so the documented first step
   * failed with "has no published version to run" on precisely the connectors it was written
   * for.
   *
   * Returns null when no ConnectorDefinition exists for the name, like tryResolveManifest: a
   * bundled connector has no manifest, which is an answer and not an error.
   */
  async resolveAuthoredManifest(
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
        ? await this.versionRepo.findOne({ where: { connectorDefinitionId: def.id, version } })
        : ((await this.resolveActivePublished(def)) ??
          (await this.versionRepo.findOne({
            where: { connectorDefinitionId: def.id },
            order: { version: 'DESC' },
          })));
    if (!row) {
      throw new NotFoundException(
        version !== undefined
          ? `Version ${version} of connector '${name}' not found`
          : `Connector '${name}' has no versions`
      );
    }
    return row.manifest;
  }

  /**
   * Writes the manifest to the connector's open draft, or opens the next one.
   *
   * Guarded UPDATE rather than the read-modify-write this used to be, and deliberately NOT
   * @Transactional. `save(latest)` wrote the WHOLE loaded entity back — TypeORM diffs the
   * entity against the row and ships every column that differs — so a publish landing
   * between the read and the write was undone: `status` and `publishedAt` reverted to the
   * values the now-stale entity still carried. MCP `connector_publish` runs saveDraft() then
   * publish() on the same connector while the builder autosaves alongside it, so both
   * orderings happen. One demotes a released version back to a draft, after which every run
   * 400s with "has no published version to run" until someone publishes again; the other
   * publishes the manifest of the save that lost.
   *
   * A transaction would not have closed that: the read that decides what to write still sees
   * a snapshot the write cannot rely on, and each attempt below is a single statement, which
   * a transaction adds nothing to. What closes it is the `status: DRAFT` predicate — the row
   * is edited only while it is still the draft this call read.
   *
   * Losing that predicate is not an error, it is a stale read, so the answer is to read
   * again. The same is true of the INSERT branch: two saves that both read the latest version
   * compute the same next number and IDX_connector_definition_version_definitionId_version
   * refuses the second, which used to escape as a bare driver 500. Either way the retry
   * lands on the state a serialized pair of calls would have produced.
   */
  async saveDraft(
    projectId: string,
    id: string,
    manifest: Record<string, unknown>
  ): Promise<ConnectorDefinitionVersion> {
    this.assertManifestFitsSpawn(manifest);
    await this.getById(projectId, id);

    for (let attempt = 0; attempt < SAVE_DRAFT_ATTEMPTS; attempt++) {
      const latest = await this.versionRepo.findOne({
        where: { connectorDefinitionId: id },
        order: { version: 'DESC' },
      });

      if (latest && latest.status === ConnectorDefinitionVersionStatus.DRAFT) {
        const result = await this.versionRepo.update(
          { id: latest.id, status: ConnectorDefinitionVersionStatus.DRAFT },
          // Cast for TypeORM's inference only, and it costs no safety: this is the same
          // value the column already holds elsewhere in this file. `manifest` is a json
          // column typed `Record<string, unknown>`, and QueryDeepPartialEntity distributes
          // over that index signature into a shape no plain object satisfies.
          { manifest } as QueryDeepPartialEntity<ConnectorDefinitionVersion>
        );
        if (result.affected) {
          latest.manifest = manifest;
          return latest;
        }

        // Zero affected rows is not proof the predicate rejected the row: MySQL counts
        // CHANGED rows rather than MATCHED ones unless CLIENT_FOUND_ROWS is set, which
        // TypeORM does not set, so re-saving an identical manifest — the builder's autosave,
        // routinely — reports zero too. Read the row instead of guessing which happened.
        const current = await this.versionRepo.findOne({ where: { id: latest.id } });
        if (current?.status === ConnectorDefinitionVersionStatus.DRAFT) {
          return current;
        }
        continue;
      }

      try {
        return await this.versionRepo.save(
          this.versionRepo.create({
            connectorDefinitionId: id,
            version: (latest?.version ?? 0) + 1,
            manifest,
            status: ConnectorDefinitionVersionStatus.DRAFT,
          })
        );
      } catch (e) {
        if (!isUniqueConstraintViolation(e)) {
          throw e;
        }
      }
    }

    throw new ConflictException(
      `Connector '${id}' is being changed by another request. Reload it and save again.`
    );
  }

  /**
   * Marking the draft published and pointing the definition at it are one change: a version
   * flagged published that nothing activates is a release users cannot see or roll back.
   */
  @Transactional()
  async publish(projectId: string, id: string): Promise<PublishedConnectorVersion> {
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

    const warnings = this.reportSecretCoverage(def.name, draft.version, model);

    draft.status = ConnectorDefinitionVersionStatus.PUBLISHED;
    draft.publishedAt = new Date();
    const published = await this.versionRepo.save(draft);

    def.activeVersionId = published.id;
    await this.definitionRepo.save(def);

    return { version: published, warnings };
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
   *
   * The row's name is tombstoned in the same transaction, which is what frees it for reuse --
   * see tombstonedName(). Both writes or neither: a soft delete that committed without the
   * rename would hold the name for good, and a rename that committed without the delete would
   * leave a live connector under a name nobody can search for.
   */
  @Transactional()
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

    // Only the name column, never save(def): the loaded entity also carries activeVersionId,
    // and writing the whole row back would revert a publish that landed since the read.
    await this.definitionRepo.update({ id }, { name: tombstonedName(def.name, id) });
    await this.definitionRepo.softDelete(id);
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
   *
   * Because nothing here refuses, the warning IS the mitigation — which is why it is
   * returned as well as logged. A managed-cloud author cannot read the backend log, so a
   * log-only warning tells the one person who can fix the manifest precisely nothing.
   *
   * Only the author-actionable items are returned. The auto-marking notice above stays a
   * log line: it fires on the ordinary, correct path (a manifest that relies on the sweep,
   * which is what the sweep is for), and a "warning" every good publish emits is a warning
   * authors learn to skip past.
   */
  private reportSecretCoverage(
    connectorName: string,
    version: number,
    model: ParsedManifestAuthReport
  ): string[] {
    const prefix = `Connector '${connectorName}' v${version}:`;

    const autoMarked = model.autoSecretAuthParameters ?? [];
    if (autoMarked.length > 0) {
      this.logger.log(
        `${prefix} marked ${autoMarked.join(', ')} as SECRET — ` +
          `used by "authentication" but not declared secret in the manifest. ` +
          `These values are stored separately and masked in API responses.`
      );
    }

    const warnings: string[] = [];

    const undeclared = model.undeclaredAuthParameters ?? [];
    if (undeclared.length > 0) {
      warnings.push(
        `${prefix} "authentication" references undeclared ` +
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
      warnings.push(
        `${prefix} parameter '${entry.parameter}' looks like a ` +
          `credential and is interpolated into a node request${where}, but is not marked SECRET. ` +
          `Its value stays in plain text in the Data Mart definition and is returned to anyone ` +
          `who can read the Data Mart. Add "attributes": ["SECRET"] to the parameter if it is a ` +
          `credential.`
      );
    }

    for (const parameter of this.collectSecretsCarryingValues(model.parameters)) {
      warnings.push(
        `${prefix} parameter '${parameter}' is SECRET and declares a ` +
          `default, placeholder or options list. Those are values for a credential field, and ` +
          `the configuration specification — which every project member can read, and any MCP ` +
          `client holding "mcp:read" — withholds them, so they will not reach the ` +
          `configuration form. Remove them, or drop the "SECRET" attribute if the value is not ` +
          `a credential.`
      );
    }

    for (const warning of warnings) {
      this.logger.warn(warning);
    }
    return warnings;
  }

  /**
   * SECRET parameters carrying one of the keys ConnectorService.mapConfigFieldToSchema
   * withholds, so publish can tell the author what the specification is about to drop.
   *
   * Without this the fix is silent in the wrong direction: an author who pre-filled a shared
   * token as a `default` sees their connector stop pre-filling with no explanation anywhere,
   * and the natural conclusion is that the platform broke rather than that they published a
   * credential. Reads the PARSED parameters, so auto-marked secrets are covered too, and
   * descends `oneOf` branches, which is where an auth credential usually sits.
   */
  private collectSecretsCarryingValues(parameters: unknown, prefix = ''): string[] {
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return [];

    const found: string[] = [];
    for (const [name, raw] of Object.entries(parameters as Record<string, unknown>)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const field = raw as Record<string, unknown>;
      const attributes = Array.isArray(field.attributes) ? field.attributes : [];
      const carriesValue = ['default', 'placeholder', 'options'].some(
        key => field[key] !== undefined
      );
      if (attributes.includes(Core.CONFIG_ATTRIBUTES.SECRET) && carriesValue) {
        found.push(`${prefix}${name}`);
      }
      for (const branch of Array.isArray(field.oneOf) ? field.oneOf : []) {
        const option = branch as Record<string, unknown>;
        found.push(
          ...this.collectSecretsCarryingValues(option.items, `${prefix}${name}.${option.value}.`)
        );
      }
    }
    return found;
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

  /**
   * The connector's released manifest, or null when it has none.
   *
   * The `status` filter is belt-and-braces rather than dead code: publish() and
   * setActiveVersion() are the only writers of activeVersionId and both point it at a
   * published row, so it should never match a draft -- but this feeds a viewer-readable
   * endpoint, and a future writer that forgets the rule would silently turn it into a draft
   * reader again.
   *
   * There is deliberately no fall back to the latest version. It used to fall back, which
   * meant a connector that had NEVER been published rendered its draft's parameters to
   * every project member through GET :id/specification -- and produced a configuration form
   * for a connector no run could use, since the run path refuses an unpublished manifest.
   */
  private async resolveActivePublished(
    def: ConnectorDefinition
  ): Promise<ConnectorDefinitionVersion | null> {
    if (!def.activeVersionId) return null;
    return this.versionRepo.findOne({
      where: { id: def.activeVersionId, status: ConnectorDefinitionVersionStatus.PUBLISHED },
    });
  }

  /**
   * Both checks compare case-INSENSITIVELY, which is stricter than either database this runs
   * on and stricter than the name pattern needs to be.
   *
   * A connector name is a case-insensitive identifier in the places that decide what it
   * means, and was a case-sensitive one only here:
   *  - IDX_connector_definition_projectId_name follows the connection's collation. MySQL's
   *    default is case-insensitive, so production has always treated `report` and `Report` as
   *    one name; sqlite compares varchar as BINARY, so local development treats them as two.
   *    A case-sensitive guard therefore passed a name that dev accepted and production
   *    refused — and refused as a raw driver error, since the guard had already said yes;
   *  - ConnectorService resolves BUNDLED names before custom ones, so `googleads` slipping
   *    past a case-sensitive reserved-name check produced a connector that no resolve path
   *    can reach: its author gets the bundled GoogleAds specification, with nothing anywhere
   *    explaining why.
   *
   * Folding needs no locale: NAME_PATTERN admits ASCII letters, digits and underscores only,
   * and String.prototype.toLowerCase is locale-independent.
   */
  private async assertNameAvailable(projectId: string, name: string): Promise<void> {
    if (!NAME_PATTERN.test(name)) {
      throw new BadRequestException(
        `Connector name '${name}' is invalid: must start with a letter and contain only letters, digits, or underscores`
      );
    }
    const normalized = name.toLowerCase();
    if (RESERVED_NAMES.has(normalized)) {
      throw new BadRequestException(`Connector name '${name}' is reserved by a built-in connector`);
    }
    // Compared in memory rather than with LOWER() in the WHERE clause: a function on the
    // column defeats the index either way, and this keeps the comparison the same on every
    // driver instead of inheriting each one's collation. A project's custom connector count
    // is small, and only `name` is read.
    //
    // withDeleted: true no longer decides whether a deleted connector's name is free —
    // softDelete() tombstones the name itself, and a tombstone can never equal a name that
    // passed NAME_PATTERN above. The flag stays because the unique index spans tombstones:
    // reading exactly the rows the index constrains is what keeps this guard's 400 and the
    // index's 409 talking about the same set, whatever a future write does to a deleted row.
    const namesInProject = await this.definitionRepo.find({
      where: { projectId },
      withDeleted: true,
      select: ['id', 'name'],
    });
    if (namesInProject.some(existing => existing.name.toLowerCase() === normalized)) {
      throw new BadRequestException(
        `A custom connector named '${name}' already exists in this project`
      );
    }
  }
}
