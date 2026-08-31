import { ForbiddenException, Injectable } from '@nestjs/common';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { ConnectorTestService } from '../services/connector/connector-test.service';
import { ConnectorDefinitionService } from '../services/connector/connector-definition.service';
import {
  McpConnectorAuthoringFacade,
  McpTestConnectorRequest,
  McpTestConnectorResponse,
  McpPublishConnectorRequest,
  McpPublishConnectorResponse,
  McpDeleteConnectorRequest,
  McpDeleteConnectorResponse,
  McpConnectorVersionsRequest,
  McpConnectorVersionsResponse,
  McpSetConnectorVersionRequest,
  McpSetConnectorVersionResponse,
} from './mcp-connector-authoring.facade';

/**
 * Bounds on the log trail `connector_test` hands back over MCP.
 *
 * The trail is unbounded at the source: the test child's own limit is one megabyte PER
 * LINE, and a run can emit many. The consumer here is a model reading the tool result as
 * text, so an unbounded trail would cost far more context than the answer is worth — and
 * the same request is what makes the result trustworthy at all.
 *
 * The NEWEST entries are kept, because that is where the answer lives: the connector
 * engine appends its diagnostics as it goes, and ConnectorTestService pushes the
 * "produced 0 records" explanation last of all. Entries older than the cap are replaced
 * by a single notice saying how many were dropped, so a truncated trail can never be
 * mistaken for a complete one.
 */
export const MCP_TEST_LOG_MAX_ENTRIES = 50;
export const MCP_TEST_LOG_MAX_ENTRY_CHARS = 2000;
export const MCP_TEST_LOG_MAX_TOTAL_CHARS = 8000;

/**
 * Reduce a test run's logs to something safe to put on an MCP tool result.
 *
 * An over-long entry is capped rather than dropped: the newest line is often the failure
 * itself, and a single verbose response body must not be able to evict the rest of the
 * trail by consuming the whole character budget.
 */
export function boundTestLogsForMcp(logs: string[]): string[] {
  const kept: string[] = [];
  let remaining = MCP_TEST_LOG_MAX_TOTAL_CHARS;

  for (let i = logs.length - 1; i >= 0 && kept.length < MCP_TEST_LOG_MAX_ENTRIES; i--) {
    const line = logs[i];
    const entry =
      line.length > MCP_TEST_LOG_MAX_ENTRY_CHARS
        ? `${line.slice(0, MCP_TEST_LOG_MAX_ENTRY_CHARS)}… [truncated]`
        : line;
    if (entry.length > remaining) break;
    remaining -= entry.length;
    kept.unshift(entry);
  }

  const dropped = logs.length - kept.length;
  return dropped > 0 ? [`… ${dropped} earlier log line(s) omitted`, ...kept] : kept;
}

@Injectable()
export class McpConnectorAuthoringFacadeImpl implements McpConnectorAuthoringFacade {
  constructor(
    private readonly testService: ConnectorTestService,
    private readonly definitionService: ConnectorDefinitionService
  ) {}

  /**
   * Connector authoring is gated on the caller's PROJECT ROLE, mirroring
   * ConnectorDefinitionController: reads (`GET :id`, `GET :id/versions/:version`)
   * are `@Auth(Role.viewer())`, while create / test / draft / publish / activate /
   * delete are all `@Auth(Role.editor())`.
   *
   * Everything in front of this facade enforces OAuth SCOPES, not roles
   * (McpAuthGuard requires `mcp:read`; McpSdkServerFactory.assertScopes requires
   * each tool's `requiredScopes`). A scope records what the client application
   * asked for, so a project viewer whose MCP client holds `mcp:write` would
   * otherwise reach every mutation below.
   *
   * This is a direct role check rather than an `AccessDecisionService.canAccess`
   * call because that service resolves a decision from (entityType, entityId)
   * against ownership rows, sharing flags and context joins — a connector
   * definition has none of the three, and `EntityType` has no CONNECTOR member.
   * Introducing one would also make `ContextAccessService.getEntityContextConfig`
   * throw ("Unsupported entity type for context overlap") for any member whose
   * role scope is SELECTED_CONTEXTS, i.e. break legitimate editors. The
   * comparison itself goes through `satisfiesRole`, the same `ROLE_HIERARCHY` that
   * `IdpGuard.checkRoleAuthorization` applies to `@Auth(Role.editor())`, so MCP and
   * REST refuse the same callers by construction rather than by two lists staying in
   * step.
   */
  private assertCanAuthor(roles: string[], operation: string): void {
    if (satisfiesRole(roles, 'editor')) {
      return;
    }
    throw new ForbiddenException(
      `Refused ${operation}: it requires the editor or admin project role, ` +
        `but this MCP session's roles are [${roles.join(', ')}].`
    );
  }

  async testConnector(request: McpTestConnectorRequest): Promise<McpTestConnectorResponse> {
    // Ahead of runTest: a connector test drives outbound HTTP from our servers,
    // so an unauthorized caller must not be able to trigger the request at all.
    this.assertCanAuthor(request.roles, 'connector_test (running a connector manifest test)');

    const result = await this.testService.runTest({
      projectId: request.projectId,
      manifest: request.manifest,
      node: request.node,
      configuration: request.configuration ?? {},
      maxRows: request.maxRows,
      maxPages: request.maxPages,
    });
    // `logs` travels with the result. A run whose recordPath matched nothing returns
    // `rows: []` and `error: null` — a shape a caller reads as success — and the only
    // thing that says otherwise is the diagnostic runTest appends to the trail.
    return {
      rows: result.rows,
      sample: result.sample,
      error: result.error,
      logs: boundTestLogsForMcp(result.logs),
    };
  }

  async publishConnector(
    request: McpPublishConnectorRequest
  ): Promise<McpPublishConnectorResponse> {
    this.assertCanAuthor(request.roles, 'connector_publish (publishing a connector)');

    const connectorId = request.connectorId;

    if (!connectorId) {
      // createAndPublish, not create-then-publish: this shape is one operation to the caller,
      // and the manifest reaching it has never been validated as a whole (connector_test
      // parses only the node it runs). Two transactions left a manifest the parser rejects as
      // a committed, unpublishable connector whose name stayed reserved for good.
      const { definition, version, warnings } = await this.definitionService.createAndPublish(
        request.projectId,
        request.userId,
        {
          name: request.name!,
          title: request.title!,
          manifest: request.manifest!,
        }
      );
      return {
        connectorId: definition.id,
        name: definition.name,
        version: version.version,
        status: version.status,
        warnings,
      };
    }

    if (request.manifest) {
      // Update: stage the new manifest as a draft, then publish it as a new
      // version. publish() validates via ManifestParser and throws on an
      // invalid manifest, so the previously-active version keeps serving.
      //
      // Deliberately not rolled back with the publish: the connector already exists, so a
      // rejected manifest costs an unpublished draft the next call overwrites. Discarding it
      // would throw away what the caller just sent and leave them nothing to correct.
      await this.definitionService.saveDraft(request.projectId, connectorId, request.manifest);
    }

    const { version: published, warnings } = await this.definitionService.publish(
      request.projectId,
      connectorId
    );
    const name =
      request.name ?? (await this.definitionService.getById(request.projectId, connectorId)).name;

    return { connectorId, name, version: published.version, status: published.status, warnings };
  }

  async deleteConnector(request: McpDeleteConnectorRequest): Promise<McpDeleteConnectorResponse> {
    this.assertCanAuthor(request.roles, 'connector_delete (deleting a connector)');

    // softDelete carries the in-use guard, so a connector referenced by any
    // data mart throws BusinessViolationException before anything is removed.
    await this.definitionService.softDelete(request.projectId, request.connectorId);
    return { connectorId: request.connectorId, deleted: true };
  }

  async listConnectorVersions(
    request: McpConnectorVersionsRequest
  ): Promise<McpConnectorVersionsResponse> {
    // Deliberately unguarded beyond the MCP guard's own project-member check:
    // this is the read path, and the REST equivalents (GET :id, GET
    // :id/versions/:version) are @Auth(Role.viewer()).
    const [def, versions] = await Promise.all([
      this.definitionService.getById(request.projectId, request.connectorId),
      this.definitionService.listVersions(request.projectId, request.connectorId),
    ]);

    return {
      versions: versions.map(row => ({
        version: row.version,
        status: row.status,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        isActive: !!def.activeVersionId && row.id === def.activeVersionId,
      })),
    };
  }

  async setConnectorVersion(
    request: McpSetConnectorVersionRequest
  ): Promise<McpSetConnectorVersionResponse> {
    // Rolling the active version moves every unpinned data mart onto a different
    // manifest, so this is as consequential as a publish.
    this.assertCanAuthor(
      request.roles,
      "connector_set_version (changing a connector's active version)"
    );

    // setActiveVersion refuses a version that is not PUBLISHED.
    await this.definitionService.setActiveVersion(
      request.projectId,
      request.connectorId,
      request.version
    );
    return { connectorId: request.connectorId, activeVersion: request.version };
  }
}
