import { AuthApi } from './auth.js';
import { DataMartsApi } from './data-marts.js';
import { DestinationsApi } from './destinations.js';
import { InsightsApi } from './insight-templates.js';
import { MarkdownApi } from './markdown.js';
import { ModelCanvasApi } from './model-canvas.js';
import { PluginsApi } from './plugins.js';
import { ProjectApi } from './project.js';
import { ReportsApi } from './reports.js';
import { RunsApi } from './runs.js';
import { SearchApi } from './search.js';
import { StoragesApi } from './storages.js';
import { ApiKeyTransport } from './transports/api-key-transport.js';
import type { OWOXTransport } from './transport.js';

export type OWOXApiClientOptions =
  | {
      apiKey: string;
      fetchImpl?: typeof fetch;
      /** Long NDJSON reads need a dispatcher with no body timeout; `owox-ctl` supplies one. */
      streamDispatcher?: unknown;
    }
  /**
   * An externally supplied transport, for callers that hold no OWOX credential.
   *
   * This is how a plugin gets `ctx.owox`: the SDK owns a transport that forwards over a
   * MessagePort to the trusted host, which attaches the credential. Plugin code never
   * constructs one and never sees a token.
   */
  | { transport: OWOXTransport };

export class OWOXApiClient implements OWOXTransport {
  readonly auth: AuthApi;
  readonly dataMarts: DataMartsApi;
  readonly storages: StoragesApi;
  readonly plugins: PluginsApi;
  readonly destinations: DestinationsApi;
  readonly insights: InsightsApi;
  readonly markdown: MarkdownApi;
  readonly models: ModelCanvasApi;
  readonly project: ProjectApi;
  readonly reports: ReportsApi;
  readonly runs: RunsApi;
  readonly search: SearchApi;

  private readonly transport: OWOXTransport;

  constructor(options: OWOXApiClientOptions) {
    this.transport = 'transport' in options ? options.transport : new ApiKeyTransport(options);

    // Every resource takes the transport structurally, so none of them can tell which
    // one it got -- which is what lets the same resource code serve a plugin iframe.
    this.auth = new AuthApi(this);
    this.dataMarts = new DataMartsApi(this);
    this.storages = new StoragesApi(this);
    this.plugins = new PluginsApi(this);
    this.destinations = new DestinationsApi(this);
    this.insights = new InsightsApi(this);
    this.markdown = new MarkdownApi(this);
    this.models = new ModelCanvasApi(this);
    this.project = new ProjectApi(this);
    this.reports = new ReportsApi(this);
    this.runs = new RunsApi(this);
    this.search = new SearchApi(this);
  }

  /** No-op for transports that carry no credential of their own. */
  async authenticate(): Promise<void> {
    await this.transport.authenticate?.();
  }

  async getJson<T>(path: string, query?: Record<string, string>): Promise<T> {
    return this.transport.getJson<T>(path, query);
  }

  async putJson<T>(path: string, jsonBody: unknown): Promise<T> {
    return this.transport.putJson<T>(path, jsonBody);
  }

  async postJson<T>(path: string, jsonBody: unknown, accept?: string): Promise<T> {
    return this.transport.postJson<T>(path, jsonBody, accept);
  }

  async getStream(path: string, query?: URLSearchParams): Promise<Response> {
    return this.transport.getStream(path, query);
  }
}
