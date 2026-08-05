import { OWOXApiError } from './errors.js';
import { isRecord } from './validation.js';

/**
 * Authority level a plugin was published at. The three are independent and combine into
 * one Gallery per member; there is no precedence between them.
 */
export type OWOXPluginPublicationScope = 'deployment' | 'project' | 'member';

export interface OWOXReleaseRejection {
  tagName: string;
  githubReleaseId: string | null;
  code: string;
  detail: string;
}

/** Source diagnostics for publishers only (§6.2 / §16). */
export interface OWOXPluginPublisherDiagnostics {
  deliveryUrl: string | null;
  commitSha: string | null;
  accessMode: string | null;
  syncedAt: string | null;
  acceptedSemvers: string[];
  unchangedSemvers: string[];
  rejections: OWOXReleaseRejection[];
}

export interface OWOXPluginPublication {
  publicationId: string;
  pluginId: string;
  /** Canonical owner/name; required to unpublish private repositories. */
  repository: string;
  scope: OWOXPluginPublicationScope;
  isActive: boolean;
  /** Deployment scope only. Indivisible: projects cannot be excluded from it. */
  allProjects: boolean;
  audienceProjectIds: string[];
  currentSemver: string | null;
  diagnostics: OWOXPluginPublisherDiagnostics;
}

/**
 * What a managed update check did.
 *
 * `already_running` means another check for this plugin is recent or in flight and its
 * result stands; `failed` means the current version is still active and the deployment
 * will try again at its next daily check.
 */
export type OWOXPluginUpdateOutcome = 'updated' | 'up_to_date' | 'already_running' | 'failed';

export interface OWOXPluginUpdateResult {
  pluginId: string;
  repository: string;
  currentVersionId: string | null;
  currentSemver: string | null;
  outcome: OWOXPluginUpdateOutcome;
  updated: boolean;
  /** When the deployment checks again on its own, ISO-8601. Asking now does not move it. */
  nextCheckAt: string | null;
  /** Set for deployment publishers; null for ordinary members. */
  diagnostics: OWOXPluginPublisherDiagnostics | null;
}

export interface OWOXPluginSuspension {
  pluginId: string;
  suspended: boolean;
  note: string | null;
}

/**
 * Which projects a deployment publication reaches.
 *
 * Exactly one form must be chosen -- there is no implicit all-projects default, and
 * combining them is rejected by the server.
 */
export interface OWOXDeploymentAudience {
  projectIds?: string[];
  allProjects?: boolean;
}

export interface OWOXPublishPluginInput extends OWOXDeploymentAudience {
  /** GitHub repository, as a URL or owner/name. */
  repository: string;
  scope: OWOXPluginPublicationScope;
}

/** Structural, like every other resource here, so any transport can back it. */
type PluginsRequester = {
  getJson<T>(path: string, query?: Record<string, string>): Promise<T>;
  postJson<T>(path: string, jsonBody: unknown): Promise<T>;
};

const BASE = '/api/plugins';

/**
 * Accepts a response only when it carries the field that identifies its shape.
 *
 * `isRecord` rather than a local object test: it also excludes arrays, which the two
 * hand-rolled guards this replaces did not.
 */
function asShape<T>(value: unknown, marker: string, operation: string): T {
  if (!isRecord(value) || !(marker in value)) {
    throw new OWOXApiError(
      `OWOX Plugins API returned an unexpected response shape for ${operation}`,
      {
        details: value,
      }
    );
  }

  return value as T;
}

const asPublication = (value: unknown, operation: string) =>
  asShape<OWOXPluginPublication>(value, 'publicationId', operation);

const asUpdateResult = (value: unknown, operation: string) =>
  asShape<OWOXPluginUpdateResult>(value, 'pluginId', operation);

/**
 * Publisher-facing plugin catalog operations.
 *
 * Project and member identity are never parameters: the server takes them from the
 * authenticated context, so an admin of one project cannot publish into another.
 */
export class PluginsApi {
  constructor(private readonly requester: PluginsRequester) {}

  async publish(input: OWOXPublishPluginInput): Promise<OWOXPluginPublication> {
    return asPublication(
      await this.requester.postJson<unknown>(`${BASE}/publications`, input),
      'publish'
    );
  }

  /**
   * Removes a listing, or part of a deployment audience. Catalog-only: installations
   * are untouched, the plugin is not suspended, and other publications may keep it
   * visible.
   */
  async unpublish(input: OWOXPublishPluginInput): Promise<OWOXPluginPublication> {
    return asPublication(
      await this.requester.postJson<unknown>(`${BASE}/publications/unpublish`, input),
      'unpublish'
    );
  }

  /** Only the publications the caller may manage at that scope. */
  async listPublications(scope: OWOXPluginPublicationScope): Promise<OWOXPluginPublication[]> {
    const response = await this.requester.getJson<unknown>(`${BASE}/publications`, { scope });

    if (!Array.isArray(response)) {
      throw new OWOXApiError('OWOX Plugins API returned an unexpected response shape', {
        details: response,
      });
    }

    return response as OWOXPluginPublication[];
  }

  /**
   * Asks the deployment to run its managed update check for this plugin now.
   *
   * Updates are checked daily on their own; this only makes the next check happen at
   * once. It selects no version: whatever valid higher SemVer the check finds becomes
   * current for every installation of that plugin, and the plugin's own daily slot does
   * not move. The plugin must already be known to the deployment (cached owner/name).
   */
  async update(repository: string): Promise<OWOXPluginUpdateResult> {
    return asUpdateResult(
      await this.requester.postJson<unknown>(`${BASE}/update`, { repository }),
      'update'
    );
  }

  async suspend(repository: string, note?: string): Promise<OWOXPluginSuspension> {
    return this.requester.postJson<OWOXPluginSuspension>(`${BASE}/suspend`, { repository, note });
  }

  async resume(repository: string, note?: string): Promise<OWOXPluginSuspension> {
    return this.requester.postJson<OWOXPluginSuspension>(`${BASE}/resume`, { repository, note });
  }
}
