import type { BuilderManifest } from '../model/manifest.types';

export interface CustomConnectorListItemDto {
  id: string;
  name: string;
  title: string;
  description: string | null;
  logo: string | null;
  docUrl: string | null;
  activeVersionId: string | null;
  activeVersion?: number | null;
}

export interface CustomConnectorVersionSummaryDto {
  version: number;
  status: 'draft' | 'published';
  publishedAt: string | null;
}

export interface CustomConnectorDetailDto extends CustomConnectorListItemDto {
  versions: CustomConnectorVersionSummaryDto[];
}

export interface CustomConnectorVersionDto {
  version: number;
  status: 'draft' | 'published';
  manifest: BuilderManifest;
}

export interface CreateCustomConnectorPayload {
  name: string;
  title: string;
  description?: string;
  logo?: string;
  docUrl?: string;
  manifest: BuilderManifest;
}

/**
 * A partial update: an omitted field is left alone, an explicit null clears a nullable one.
 * `name` is absent by design — data marts reference their connector by name, so renaming a
 * definition would unbind them. Deleting the connector is what frees a name for reuse.
 */
export interface UpdateCustomConnectorMetadataPayload {
  title?: string;
  description?: string | null;
  logo?: string | null;
  docUrl?: string | null;
}

export interface ActivateVersionResultDto {
  activeVersionId: string | null;
  activeVersion: number;
}

export interface ConnectorTestResultDto {
  rows: Record<string, unknown>[];
  logs: string[];
  error: string | null;
  sample?: Record<string, unknown>[];
}

export interface TestConnectorPayload {
  manifest: BuilderManifest;
  node: string;
  configuration: Record<string, unknown>;
  maxRows?: number;
}
