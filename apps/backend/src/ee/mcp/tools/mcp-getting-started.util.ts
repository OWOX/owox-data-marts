import { castError } from '@owox/internal-helpers';
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { McpDataMartsFacade } from '../../../data-marts/facades/mcp-data-marts.facade';
import { ACCESS_MATRIX } from '../../../data-marts/services/access-decision/access-matrix.config';
import {
  Action,
  EntityType,
} from '../../../data-marts/services/access-decision/access-decision.types';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import {
  buildCreateDataMartUiPath,
  buildDataMartsUiPath,
  buildDataMartUiPath,
} from './data-mart-ui-path';
import {
  CONNECTOR_DATA_MART_GUIDE_URL,
  DATA_MARTS_CORE_CONCEPTS_URL,
  SQL_DATA_MART_GUIDE_URL,
} from './mcp-docs-urls';
import { joinPublicOrigin } from './mcp-public-url.util';

const logger = new Logger('McpGettingStarted');

/**
 * Roles that can create a Data Mart. The backend gates creation on STORAGE/USE
 * (CreateDataMartService), so a role the access matrix lets use a storage in at least one
 * ownership/sharing state qualifies. Derived from the matrix instead of listed by hand so the
 * assistant's role advice cannot drift from what the backend enforces — today Project Admin
 * and Technical User; a Business User (`viewer`) is denied on every state.
 */
const DATA_MART_CREATOR_ROLES: ReadonlySet<string> = new Set(
  ACCESS_MATRIX.filter(
    rule => rule.entityType === EntityType.STORAGE && rule.action === Action.USE && rule.result
  ).map(rule => rule.role)
);

/**
 * Attached to a discovery tool result when the user sees no published Data Mart, so the
 * assistant can explain what to do next instead of reporting an empty catalog. Every MCP
 * data-mart tool works with published Data Marts only, and a Data Mart can be created and
 * published only in the web app — hence the deep links and guides rather than a tool call.
 */
export const gettingStartedSchema = z.object({
  reason: z.literal('no_published_data_marts'),
  can_create_data_marts: z
    .boolean()
    .describe('Whether the current user role may create and publish Data Marts.'),
  create_data_mart_url: z
    .string()
    .describe('Page in OWOX Data Marts where the user creates a new Data Mart.'),
  data_marts_url: z.string().describe('Data Marts list page of the current project.'),
  guides: z.object({
    core_concepts: z.string(),
    connector_data_mart: z.string(),
    sql_data_mart: z.string(),
  }),
  draft_data_marts: z
    .array(z.object({ id: z.string(), title: z.string(), url: z.string() }))
    .describe('Draft Data Marts visible to the user; unavailable through MCP until published.'),
  instructions: z.string().describe('What to tell the user; relay it in their language.'),
});

export type McpGettingStarted = z.infer<typeof gettingStartedSchema>;

export interface McpGettingStartedDeps {
  dataMarts: McpDataMartsFacade;
  publicOrigin: string;
}

/** Whether the user sees at least one published Data Mart in the current project. */
export async function hasPublishedDataMarts(
  dataMarts: McpDataMartsFacade,
  context: McpAuthContext
): Promise<boolean> {
  const result = await dataMarts.listDataMarts({
    projectId: context.projectId,
    userId: context.userId,
    roles: context.roles,
    status: 'published',
  });
  return result.dataMarts.length > 0;
}

/**
 * Guidance for a user who sees no published Data Mart, or `undefined` when they do see one
 * (an empty search result then just means nothing matched). Use when the published catalog
 * has not been fetched yet; call `buildGettingStarted` directly when it is known to be empty.
 */
export async function resolveGettingStarted(
  deps: McpGettingStartedDeps,
  context: McpAuthContext
): Promise<McpGettingStarted | undefined> {
  if (await hasPublishedDataMarts(deps.dataMarts, context)) return undefined;
  return buildGettingStarted(deps, context);
}

/**
 * Builds the guidance once the published catalog visible to the user is known to be empty.
 * The draft lookup is best-effort: the links and role-specific steps are still useful when
 * that enrichment fails, so a failure only drops the draft list.
 */
export async function buildGettingStarted(
  deps: McpGettingStartedDeps,
  context: McpAuthContext
): Promise<McpGettingStarted> {
  const canCreate = context.roles.some(role => DATA_MART_CREATOR_ROLES.has(role));
  const drafts = await listVisibleDrafts(deps, context);

  return {
    reason: 'no_published_data_marts',
    can_create_data_marts: canCreate,
    create_data_mart_url: joinPublicOrigin(
      deps.publicOrigin,
      buildCreateDataMartUiPath(context.projectId)
    ),
    data_marts_url: joinPublicOrigin(deps.publicOrigin, buildDataMartsUiPath(context.projectId)),
    guides: {
      core_concepts: DATA_MARTS_CORE_CONCEPTS_URL,
      connector_data_mart: CONNECTOR_DATA_MART_GUIDE_URL,
      sql_data_mart: SQL_DATA_MART_GUIDE_URL,
    },
    draft_data_marts: drafts,
    instructions: buildInstructions(canCreate, drafts.length),
  };
}

async function listVisibleDrafts(
  deps: McpGettingStartedDeps,
  context: McpAuthContext
): Promise<McpGettingStarted['draft_data_marts']> {
  try {
    const result = await deps.dataMarts.listDataMarts({
      projectId: context.projectId,
      userId: context.userId,
      roles: context.roles,
      status: 'draft',
    });
    return result.dataMarts.map(dataMart => ({
      id: dataMart.id,
      title: dataMart.title,
      url: joinPublicOrigin(deps.publicOrigin, buildDataMartUiPath(context.projectId, dataMart.id)),
    }));
  } catch (error: unknown) {
    logger.warn('Failed to list draft data marts for MCP getting-started guidance', {
      projectId: context.projectId,
      error: castError(error).message,
    });
    return [];
  }
}

function buildInstructions(canCreate: boolean, draftCount: number): string {
  const parts: string[] = [
    canCreate
      ? 'This project has no published Data Mart visible to the user, so there is nothing to explore or query through MCP yet.'
      : 'No published Data Mart is shared with the user in this project, so there is nothing to explore or query through MCP yet.',
    'Explain in one or two sentences that a Data Mart is a reusable dataset defined in OWOX Data Marts — data collected from a connector (for example Facebook Ads, Google Ads, or TikTok Ads) or defined as SQL, a table, or a view on a connected storage — and that MCP works only with published Data Marts.',
  ];

  if (draftCount > 0) {
    parts.push(
      `The user can see ${draftCount} draft Data Mart(s) listed in draft_data_marts; name them with their url. Drafts are not available through MCP until they are ${
        canCreate
          ? 'opened in the OWOX Data Marts web app, finished, and published.'
          : 'published by a Project Admin or a Technical User.'
      }`
    );
  }

  parts.push(
    canCreate
      ? 'The user can create Data Marts. Walk them through the steps: 1) open create_data_mart_url in the OWOX Data Marts web app; 2) connect a data source or define the Data Mart from SQL, a table, or a view on a connected storage; 3) save and publish it. Share create_data_mart_url and the matching guide from guides.'
      : 'The user role (Business User) cannot create Data Marts. Advise them to ask a Project Admin or a Technical User of this project to create and publish a Data Mart and share it with them for reporting. Share data_marts_url and guides.core_concepts so they can pass them on.',
    'Once a published Data Mart is available, the user can simply ask again. Do not retry discovery tools with different wording, and do not call query_data_mart or any report or schedule tool until then.'
  );

  return parts.join(' ');
}
