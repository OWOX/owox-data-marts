import { BigQuery } from '@google-cloud/bigquery';
import { Injectable, Logger } from '@nestjs/common';
import { JWT, OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { raceWithTimeout } from '../../../../common/utils/promise.util';
import { DataStorage } from '../../../entities/data-storage.entity';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import type {
  IStorageResourceBrowserProvider,
  StorageResourceFilter,
  StorageResourceLeaf,
  StorageResourceNode,
} from '../../interfaces/storage-resource-browser.interface';
import {
  BIGQUERY_AUTODETECT_LOCATION,
  BigQueryConfigSchema,
} from '../schemas/bigquery-config.schema';
import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryCredentials,
  BigQueryOAuthCredentialsSchema,
  BigQueryServiceAccountCredentialsSchema,
} from '../schemas/bigquery-credentials.schema';

// Page size and result cap keep latency bounded on accounts with many datasets/tables.
const GBQ_LIST_PAGE_SIZE = 500;
const GBQ_LIST_RESULT_CAP = 2000;
// Concurrency cap for per-dataset table listing when enumerating a whole project.
const GBQ_PROJECT_FANOUT_CONCURRENCY = 8;
// Overall time budget for listing all tables/views in a project, across every dataset.
const GBQ_PROJECT_TABLES_BUDGET_MS = 75_000;
// Per-dataset timeout inside the fanout — one slow dataset must not stall the whole batch.
const GBQ_PROJECT_TABLES_PER_DATASET_TIMEOUT_MS = 20_000;
// Bounds for the potentially slow bigquery.projects.list REST call.
const GBQ_PROJECTS_PAGE_SIZE = 100;
const GBQ_PROJECTS_PAGE_TIMEOUT_MS = 15_000;
const GBQ_PROJECTS_OVERALL_BUDGET_MS = 45_000;
const GBQ_PROJECTS_MAX_PAGES = 10;
const GBQ_PROJECTS_RESULT_CAP = 1000;

interface GbqProjectListing {
  id: string;
  friendlyName?: string;
}

interface GbqDatasetListing {
  id: string;
  location?: string;
}

interface GbqTableListing {
  id: string;
  datasetId: string;
  type: 'TABLE' | 'VIEW';
  fullyQualifiedName: string;
}

type GbqTableTypeFilter = 'TABLE' | 'VIEW';

interface BigQueryClients {
  bigQuery: BigQuery;
  authClient: JWT | OAuth2Client;
}

/**
 * Singleton provider that implements resource browsing (namespace / leaf listing)
 * for Google BigQuery storages.
 *
 * All listing logic lives here; {@link BigQueryApiAdapter} is kept focused on
 * query execution.  The service is stateless — it resolves credentials and
 * creates ephemeral BigQuery clients on every call.
 */
@Injectable()
export class BigQueryStorageResourceBrowser implements IStorageResourceBrowserProvider {
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  protected readonly logger = new Logger(BigQueryStorageResourceBrowser.name);

  constructor(protected readonly credentialsResolver: DataStorageCredentialsResolver) {}

  // ── IStorageResourceBrowserProvider ───────────────────────────────────────

  async listNamespaces(storage: DataStorage): Promise<StorageResourceNode[]> {
    const clients = await this.createClients(storage);
    const projects = await this.listProjects(clients);
    return projects.map(p => ({ id: p.id, label: p.friendlyName }));
  }

  async listLeafResources(
    storage: DataStorage,
    namespaceId: string,
    filter?: StorageResourceFilter
  ): Promise<StorageResourceLeaf[]> {
    const clients = await this.createClients(storage);
    const tables = await this.listTablesInProject(clients, namespaceId, filter);
    return tables.map(t => ({
      id: t.id,
      groupId: t.datasetId,
      type: t.type,
      fullyQualifiedName: t.fullyQualifiedName,
    }));
  }

  // ── Client creation ────────────────────────────────────────────────────────

  protected async createClients(storage: DataStorage): Promise<BigQueryClients> {
    const config = BigQueryConfigSchema.parse(storage.config ?? {});
    const resolved = await this.credentialsResolver.resolve(storage);
    const saParsed = BigQueryServiceAccountCredentialsSchema.safeParse(resolved);
    const oauthParsed = BigQueryOAuthCredentialsSchema.safeParse(resolved);
    if (!saParsed.success && !oauthParsed.success) {
      throw new Error('Google BigQuery credentials are not properly configured');
    }
    const credentials: BigQueryCredentials = saParsed.success ? saParsed.data : oauthParsed.data!;

    const authClient: JWT | OAuth2Client =
      credentials.type === BIGQUERY_OAUTH_TYPE
        ? credentials.oauth2Client
        : new JWT({
            email: credentials.client_email,
            key: credentials.private_key,
            scopes: [
              'https://www.googleapis.com/auth/bigquery',
              'https://www.googleapis.com/auth/drive.readonly',
            ],
          });

    const shouldAutodetect = config.location === BIGQUERY_AUTODETECT_LOCATION;
    const bigQuery = new BigQuery({
      projectId: config.projectId,
      authClient,
      ...(shouldAutodetect ? {} : { location: config.location }),
    });

    return { bigQuery, authClient };
  }

  // ── Listing helpers ────────────────────────────────────────────────────────

  /**
   * Lists GCP projects visible to the credentials.
   *
   * Guarded by per-page timeouts, an overall time budget, and a result cap —
   * `projects.list` is very slow for OAuth users with many visible GCP projects.
   *
   * Falls back to the storage's configured project when listing fails entirely,
   * so the picker always shows at least one entry.
   */
  private async listProjects({
    authClient,
    bigQuery,
  }: BigQueryClients): Promise<GbqProjectListing[]> {
    const bq = google.bigquery({ version: 'v2', auth: authClient });
    const results: GbqProjectListing[] = [];
    const seen = new Set<string>();
    const startedAt = Date.now();
    let pageToken: string | undefined;

    try {
      for (let page = 0; page < GBQ_PROJECTS_MAX_PAGES; page++) {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= GBQ_PROJECTS_OVERALL_BUDGET_MS) {
          this.logger.warn(
            `listProjects: overall budget (${GBQ_PROJECTS_OVERALL_BUDGET_MS}ms) exceeded after ${elapsed}ms, returning ${results.length} projects`
          );
          break;
        }
        const remainingBudget = GBQ_PROJECTS_OVERALL_BUDGET_MS - elapsed;
        const pageTimeout = Math.min(GBQ_PROJECTS_PAGE_TIMEOUT_MS, remainingBudget);

        const pageRequest = bq.projects.list(
          {
            maxResults: GBQ_PROJECTS_PAGE_SIZE,
            pageToken,
            fields: 'projects(id,friendlyName,projectReference/projectId),nextPageToken',
          },
          { timeout: pageTimeout }
        );
        const { data } = await raceWithTimeout(
          pageRequest,
          pageTimeout,
          `bigquery.projects.list page ${String(page)}`
        );

        for (const project of data.projects ?? []) {
          const id = project.id ?? project.projectReference?.projectId ?? '';
          if (!id || seen.has(id)) continue;
          seen.add(id);
          results.push({ id, friendlyName: project.friendlyName ?? undefined });
          if (results.length >= GBQ_PROJECTS_RESULT_CAP) break;
        }

        if (results.length >= GBQ_PROJECTS_RESULT_CAP) {
          this.logger.warn(
            `listProjects: reached cap of ${GBQ_PROJECTS_RESULT_CAP} projects, truncating`
          );
          break;
        }

        pageToken = data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `listProjects: failed after ${Date.now() - startedAt}ms (${results.length} projects collected): ${message}`
      );
    }

    if (results.length === 0) {
      const fallbackId = bigQuery.projectId;
      if (fallbackId && typeof fallbackId === 'string') {
        this.logger.log(
          `listProjects: returning storage-configured project "${fallbackId}" as a fallback`
        );
        return [{ id: fallbackId }];
      }
    }

    return results;
  }

  private async listDatasets(
    clients: BigQueryClients,
    projectId: string
  ): Promise<GbqDatasetListing[]> {
    const bq = this.cloneForProject(clients, projectId);
    const [datasets] = await bq.getDatasets({
      autoPaginate: true,
      maxResults: GBQ_LIST_PAGE_SIZE,
    });
    return datasets
      .slice(0, GBQ_LIST_RESULT_CAP)
      .map(dataset => {
        const metadata = (dataset.metadata ?? {}) as {
          location?: string;
          datasetReference?: { datasetId?: string };
        };
        const id = dataset.id ?? metadata.datasetReference?.datasetId ?? '';
        return { id, location: dataset.location ?? metadata.location };
      })
      .filter(dataset => dataset.id);
  }

  private async listTables(
    clients: BigQueryClients,
    projectId: string,
    datasetId: string
  ): Promise<GbqTableListing[]> {
    const bq = this.cloneForProject(clients, projectId);
    const [tables] = await bq
      .dataset(datasetId, { projectId })
      .getTables({ autoPaginate: true, maxResults: GBQ_LIST_PAGE_SIZE });
    return tables
      .slice(0, GBQ_LIST_RESULT_CAP)
      .map(table => {
        const metadata = (table.metadata ?? {}) as {
          type?: string;
          tableReference?: { tableId?: string };
        };
        const id = table.id ?? metadata.tableReference?.tableId ?? '';
        const rawType = metadata.type;
        const type: 'TABLE' | 'VIEW' =
          rawType === 'VIEW' || rawType === 'MATERIALIZED_VIEW' ? 'VIEW' : 'TABLE';
        return { id, datasetId, type, fullyQualifiedName: `${projectId}.${datasetId}.${id}` };
      })
      .filter(table => table.id);
  }

  private async listTablesInProject(
    clients: BigQueryClients,
    projectId: string,
    filter?: GbqTableTypeFilter
  ): Promise<GbqTableListing[]> {
    const startedAt = Date.now();
    const datasets = await this.listDatasets(clients, projectId);
    if (datasets.length === 0) return [];

    const results: GbqTableListing[] = [];
    for (let i = 0; i < datasets.length; i += GBQ_PROJECT_FANOUT_CONCURRENCY) {
      if (results.length >= GBQ_LIST_RESULT_CAP) break;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= GBQ_PROJECT_TABLES_BUDGET_MS) {
        this.logger.warn(
          `listTablesInProject(${projectId}): budget (${GBQ_PROJECT_TABLES_BUDGET_MS}ms) exceeded after ${elapsed}ms; returning ${results.length} of ${datasets.length} datasets' worth`
        );
        break;
      }
      const batch = datasets.slice(i, i + GBQ_PROJECT_FANOUT_CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(dataset =>
          raceWithTimeout(
            this.listTables(clients, projectId, dataset.id),
            GBQ_PROJECT_TABLES_PER_DATASET_TIMEOUT_MS,
            `listTables ${projectId}.${dataset.id}`
          )
        )
      );
      for (const outcome of settled) {
        if (outcome.status === 'fulfilled') {
          for (const table of outcome.value) {
            if (filter && table.type !== filter) continue;
            results.push(table);
            if (results.length >= GBQ_LIST_RESULT_CAP) break;
          }
        } else {
          this.logger.warn(
            `Failed to list tables for a dataset in ${projectId}: ${
              outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)
            }`
          );
        }
      }
    }
    return results;
  }

  private cloneForProject({ authClient }: BigQueryClients, projectId: string): BigQuery {
    return new BigQuery({ projectId, authClient });
  }
}
